import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Clock3, RefreshCw, Search, ShieldAlert, UserRoundCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { api, type HandoffDto, type OpportunityDto } from '../lib/api/client'
import i18n from '../lib/i18n'
import './CloserQueueWorkspace.css'

type WorkKind = 'handoff' | 'overdue' | 'no_action'
type SortKey = 'priority' | 'account' | 'event' | 'deadline'
type WorkItem = { id: string; kind: WorkKind; accountName: string; contactName: string; title: string; context: string; occurredAt: string; deadline: string | null; handoff?: HandoffDto }
type OpportunityPage = Awaited<ReturnType<typeof api.opportunities.list>>

async function listAllOwnedOpportunities(): Promise<OpportunityDto[]> {
  const pageSize = 100
  const firstPage = await api.opportunities.list({ view: 'mine', limit: pageSize, offset: 0 })
  const pages: OpportunityPage[] = [firstPage]
  for (let offset = pageSize; pages[pages.length - 1].length === pageSize; offset += pageSize) {
    pages.push(await api.opportunities.list({ view: 'mine', limit: pageSize, offset }))
  }
  return pages.flat()
}

async function listAllRequestedHandoffs(): Promise<HandoffDto[]> {
  const pageSize = 100
  const records: HandoffDto[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await api.handoffs.list('requested', { limit: pageSize, offset })
    records.push(...page)
    if (page.length < pageSize) return records
  }
}

export function CloserQueueWorkspace({ userId, onOpenPipeline }: { userId: string; onOpenPipeline: () => void }) {
  const { t } = useTranslation()
  const [handoffs, setHandoffs] = useState<HandoffDto[]>([])
  const [opportunities, setOpportunities] = useState<OpportunityDto[]>([])
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<WorkKind | ''>('')
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [partial, setPartial] = useState(false)
  const [acceptingId, setAcceptingId] = useState('')
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setPartial(false); setHandoffs([]); setOpportunities([])
    Promise.allSettled([listAllRequestedHandoffs(), listAllOwnedOpportunities()]).then(([handoffResult, opportunityResult]) => {
      if (!active) return
      if (handoffResult.status === 'fulfilled') setHandoffs(handoffResult.value)
      if (opportunityResult.status === 'fulfilled') setOpportunities(opportunityResult.value)
      const failed = Number(handoffResult.status === 'rejected') + Number(opportunityResult.status === 'rejected')
      setPartial(failed === 1); setError(failed === 2 ? t('closerQueue.loadFailed') : '')
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh, t])

  const acceptHandoff = async (handoff: HandoffDto) => {
    setAcceptingId(handoff.id); setError('')
    try { await api.handoffs.accept(handoff.id); setRefresh((version) => version + 1) }
    catch { setError(t('closerQueue.acceptFailed')) }
    finally { setAcceptingId('') }
  }

  const items = useMemo(() => {
    const work: WorkItem[] = handoffs.map((handoff) => ({ id: `handoff:${handoff.id}`, kind: 'handoff', accountName: handoff.accountName, contactName: handoff.contactName, title: handoff.reason, context: handoff.evidence, occurredAt: handoff.requestedAt, deadline: handoff.nextStepAt, handoff }))
    const terminalStages = new Set(['won', 'lost'])
    for (const opportunity of opportunities) {
      if (terminalStages.has(opportunity.stage) || opportunity.ownerUserId !== userId) continue
      const due = opportunity.nextActionAt ? new Date(opportunity.nextActionAt).getTime() : null
      if (due !== null && due > Date.now()) continue
      const kind: WorkKind = due === null ? 'no_action' : 'overdue'
      work.push({ id: `opportunity:${opportunity.id}`, kind, accountName: opportunity.accountName, contactName: opportunity.contactName, title: opportunity.nextAction ?? t(`opportunityStages.${opportunity.stage}`), context: `${opportunity.name} · ${kind === 'overdue' ? t('closerQueue.overdueContext', { date: dateLabel(opportunity.nextActionAt!) }) : t('closerQueue.noActionContext')}`, occurredAt: opportunity.updatedAt, deadline: opportunity.nextActionAt ?? null })
    }
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const filtered = work.filter((item) => (!kindFilter || item.kind === kindFilter) && (!normalizedQuery || `${item.accountName} ${item.contactName} ${item.title} ${item.context}`.toLocaleLowerCase().includes(normalizedQuery)))
    const priority: Record<WorkKind, number> = { handoff: 0, overdue: 1, no_action: 2 }
    const direction = sortDirection === 'asc' ? 1 : -1
    return filtered.sort((left, right) => {
      let comparison = 0
      if (sortKey === 'priority') comparison = priority[left.kind] - priority[right.kind]
      if (sortKey === 'account') comparison = left.accountName.localeCompare(right.accountName)
      if (sortKey === 'event') comparison = left.title.localeCompare(right.title)
      if (sortKey === 'deadline') comparison = (left.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY) - (right.deadline ? new Date(right.deadline).getTime() : Number.POSITIVE_INFINITY)
      return comparison * direction || left.id.localeCompare(right.id)
    })
  }, [handoffs, opportunities, query, kindFilter, sortKey, sortDirection, userId, t])

  const columns: DataTableColumn<WorkItem, SortKey>[] = [
    { id: 'priority', label: t('closerQueue.columns.priority'), render: (item) => <span className={`closer-priority closer-priority-${item.kind}`}>{item.kind === 'handoff' ? <UserRoundCheck size={14} /> : <Clock3 size={14} />}{t(`closerQueue.kinds.${item.kind}`)}</span> },
    { id: 'account', label: t('closerQueue.columns.accountContact'), render: (item) => <div className="closer-account-cell"><strong>{item.accountName}</strong><small>{item.contactName}</small></div> },
    { id: 'event', label: t('closerQueue.columns.context'), render: (item) => <div className="closer-event-cell"><strong>{item.title}</strong><p>{item.context}</p>{item.handoff && item.handoff.confirmedFacts.length > 0 && <small>{t('closerQueue.confirmedFacts', { facts: item.handoff.confirmedFacts.join(' · ') })}</small>}{item.handoff && item.handoff.unknowns.length > 0 && <small className="closer-unknowns">{t('closerQueue.openQuestions', { questions: item.handoff.unknowns.join(' · ') })}</small>}<button className="closer-item-action" type="button" disabled={item.kind === 'handoff' && Boolean(acceptingId)} onClick={() => item.handoff ? void acceptHandoff(item.handoff) : onOpenPipeline()}>{item.handoff ? (acceptingId === item.handoff.id ? t('closerQueue.accepting') : t('closerQueue.acceptAction')) : t('closerQueue.openPipeline')}<ArrowRight size={13} /></button></div> },
    { id: 'deadline', label: t('closerQueue.columns.deadline'), render: (item) => <span className="closer-deadline">{item.deadline ? dateLabel(item.deadline) : '—'}</span> },
  ]
  const handoffCount = items.filter((item) => item.kind === 'handoff').length
  const overdueCount = items.filter((item) => item.kind === 'overdue').length
  const noActionCount = items.filter((item) => item.kind === 'no_action').length
  const pageRows = items.slice(offset, offset + limit)
  const emptyState = <div><strong>{error || t('closerQueue.empty')}</strong>{partial && <p>{t('closerQueue.partial')}</p>}</div>

  return <section className="closer-queue-page">
    <header className="closer-queue-heading"><div><p className="eyebrow">{t('closerQueue.eyebrow')}</p><h2>{t('closerQueue.title')}</h2><p className="muted">{t('closerQueue.description')}</p></div><button className="refresh" type="button" onClick={() => setRefresh((version) => version + 1)} aria-label={t('closerQueue.refresh')}><RefreshCw size={16} /></button></header>
    <div className="closer-queue-summary"><article className="summary-handoffs"><span><UserRoundCheck size={15} />{t('closerQueue.summary.handoffs')}</span><strong>{handoffCount}</strong></article><article className="summary-overdue"><span><Clock3 size={15} />{t('closerQueue.summary.overdue')}</span><strong>{overdueCount}</strong></article><article><span><ShieldAlert size={15} />{t('closerQueue.summary.noAction')}</span><strong>{noActionCount}</strong></article></div>
    {partial && <p className="closer-queue-partial">{t('closerQueue.partial')}</p>}
    <DataTable rows={pageRows} columns={columns} getRowId={(item) => item.id} sort={{ key: sortKey, direction: sortDirection }} onSortChange={(key, direction) => { setSortKey(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit, offset, total: items.length, hasNextPage: offset + limit < items.length }} onPageChange={setOffset} onPageSizeChange={(size) => { setLimit(size); setOffset(0) }} loading={loading} emptyState={emptyState} filters={<>
      <label className="closer-queue-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder={t('closerQueue.search')} aria-label={t('closerQueue.search')} /></label>
      <label className="closer-queue-filter">{t('closerQueue.filterLabel')}<select value={kindFilter} onChange={(event) => { setKindFilter(event.target.value as WorkKind | ''); setOffset(0) }}><option value="">{t('closerQueue.allTypes')}</option>{(['handoff', 'overdue', 'no_action'] as const).map((kind) => <option key={kind} value={kind}>{t(`closerQueue.kinds.${kind}`)}</option>)}</select></label>
    </>} />
  </section>
}

function dateLabel(value: string) { return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
