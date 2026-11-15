import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Clock3, MessageCircle, RefreshCw, Search, ShieldAlert, UserRoundCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { api, type CloserEventDto, type HandoffDto, type OpportunityDto } from '../lib/api/client'
import i18n from '../lib/i18n'
import './CloserQueueWorkspace.css'
import './CloserEventActions.css'

type WorkKind = 'handoff' | 'lead_reply' | 'overdue' | 'no_action'
type SortKey = 'priority' | 'account' | 'event' | 'deadline'
type WorkItem = { id: string; kind: WorkKind; accountName: string; contactName: string; title: string; context: string; occurredAt: string; deadline: string | null; handoff?: HandoffDto; event?: CloserEventDto }
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

async function listAllCloserEvents(): Promise<CloserEventDto[]> {
  const pageSize = 100
  const events: CloserEventDto[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await api.closerEvents.list({ limit: pageSize, offset })
    events.push(...page.data)
    if (!page.pagination.hasNextPage) return events
  }
}

export function CloserQueueWorkspace({ userId, onOpenPipeline, onOpenInbox }: { userId: string; onOpenPipeline: () => void; onOpenInbox: (conversationId: string) => void }) {
  const { t } = useTranslation()
  const [handoffs, setHandoffs] = useState<HandoffDto[]>([])
  const [opportunities, setOpportunities] = useState<OpportunityDto[]>([])
  const [closerEvents, setCloserEvents] = useState<CloserEventDto[]>([])
  const [eventAssignees, setEventAssignees] = useState<Array<{ id: string; name: string }>>([])
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
  const [eventAssignTarget, setEventAssignTarget] = useState('')
  const [eventAssignId, setEventAssignId] = useState('')
  const [refresh, setRefresh] = useState(0)
  const queueLoadInProgressRef = useRef(false)
  const pendingRefreshRef = useRef(false)
  const hasLoadedQueueRef = useRef(false)
  const mountedRef = useRef(true)
  const requestRefresh = useCallback(() => {
    if (queueLoadInProgressRef.current) {
      pendingRefreshRef.current = true
      return
    }
    setRefresh((version) => version + 1)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') requestRefresh()
    }
    const interval = window.setInterval(refreshIfVisible, 30_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [requestRefresh])

  useEffect(() => {
    let active = true
    if (queueLoadInProgressRef.current) {
      pendingRefreshRef.current = true
      return () => { active = false }
    }
    queueLoadInProgressRef.current = true
    if (!hasLoadedQueueRef.current) setLoading(true)
    setError(''); setPartial(false)
    Promise.allSettled([listAllRequestedHandoffs(), listAllOwnedOpportunities(), listAllCloserEvents(), api.closerEvents.assignees()]).then(([handoffResult, opportunityResult, eventResult, assigneeResult]) => {
      if (!active) return
      if (handoffResult.status === 'fulfilled') setHandoffs(handoffResult.value)
      if (opportunityResult.status === 'fulfilled') setOpportunities(opportunityResult.value)
      if (eventResult.status === 'fulfilled') setCloserEvents(eventResult.value)
      if (assigneeResult.status === 'fulfilled') setEventAssignees(assigneeResult.value)
      const failed = Number(handoffResult.status === 'rejected') + Number(opportunityResult.status === 'rejected') + Number(eventResult.status === 'rejected') + Number(assigneeResult.status === 'rejected')
      setPartial(failed > 0 && failed < 4); setError(failed === 4 ? t('closerQueue.loadFailed') : '')
    }).finally(() => {
      queueLoadInProgressRef.current = false
      if (active) {
        hasLoadedQueueRef.current = true
        setLoading(false)
      }
      if (pendingRefreshRef.current && mountedRef.current) {
        pendingRefreshRef.current = false
        requestRefresh()
      }
    })
    return () => { active = false }
  }, [refresh, t, requestRefresh])

  const acceptHandoff = async (handoff: HandoffDto) => {
    setAcceptingId(handoff.id); setError('')
    try {
      const accepted = await api.handoffs.accept(handoff.id)
      requestRefresh()
      if (accepted.conversationId) onOpenInbox(accepted.conversationId)
    }
    catch { setError(t('closerQueue.acceptFailed')) }
    finally { setAcceptingId('') }
  }
  const openEvent = async (event: CloserEventDto) => {
    setAcceptingId(event.id); setError('')
    try {
      if (event.status !== 'acknowledged') await api.closerEvents.act(event.id, { action: 'acknowledge' })
      onOpenInbox(event.conversationId)
    } catch { setError(t('closerQueue.eventActionFailed')) }
    finally { setAcceptingId('') }
  }
  const actOnEvent = async (event: CloserEventDto, input: { action: 'snooze' | 'resolve' | 'reassign'; snoozedUntil?: string; assignedToUserId?: string }) => {
    setAcceptingId(event.id); setError('')
    try {
      await api.closerEvents.act(event.id, input)
      setEventAssignTarget(''); setEventAssignId(''); requestRefresh()
    } catch { setError(t('closerQueue.eventActionFailed')) }
    finally { setAcceptingId('') }
  }

  const items = useMemo(() => {
    const handoffByOpportunity = new Map(handoffs.map((handoff) => [handoff.opportunityId, handoff]))
    const linkedHandoffIds = new Set(closerEvents.flatMap((event) => {
      const handoff = ['qualified_handoff', 'human_requested'].includes(event.eventType) ? handoffByOpportunity.get(event.opportunityId) : undefined
      return handoff ? [handoff.id] : []
    }))
    const work: WorkItem[] = handoffs.filter((handoff) => !linkedHandoffIds.has(handoff.id)).map((handoff) => ({ id: `handoff:${handoff.id}`, kind: 'handoff', accountName: handoff.accountName, contactName: handoff.contactName, title: handoff.reason, context: handoff.evidence, occurredAt: handoff.requestedAt, deadline: handoff.nextStepAt, handoff }))
    work.push(...closerEvents.map((event) => {
      const handoff = ['qualified_handoff', 'human_requested'].includes(event.eventType) ? handoffByOpportunity.get(event.opportunityId) : undefined
      return { id: handoff ? `handoff:${handoff.id}` : `event:${event.id}`, kind: handoff ? 'handoff' as const : 'lead_reply' as const, accountName: event.accountName, contactName: event.contactName, title: handoff?.reason ?? t(`closerEventTypes.${event.eventType}`), context: handoff?.evidence ?? event.evidence ?? '', occurredAt: handoff?.requestedAt ?? event.occurredAt, deadline: handoff?.nextStepAt ?? null, handoff, event }
    }))
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
    const priority: Record<WorkKind, number> = { handoff: 0, lead_reply: 0, overdue: 1, no_action: 2 }
    const direction = sortDirection === 'asc' ? 1 : -1
    return filtered.sort((left, right) => {
      let comparison = 0
      if (sortKey === 'priority') comparison = (left.event?.priority === 'urgent' ? -1 : priority[left.kind]) - (right.event?.priority === 'urgent' ? -1 : priority[right.kind])
      if (sortKey === 'account') comparison = left.accountName.localeCompare(right.accountName)
      if (sortKey === 'event') comparison = left.title.localeCompare(right.title)
      if (sortKey === 'deadline') comparison = (left.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY) - (right.deadline ? new Date(right.deadline).getTime() : Number.POSITIVE_INFINITY)
      return comparison * direction || left.id.localeCompare(right.id)
    })
  }, [handoffs, opportunities, closerEvents, query, kindFilter, sortKey, sortDirection, userId, t])

  const columns: DataTableColumn<WorkItem, SortKey>[] = [
    { id: 'priority', label: t('closerQueue.columns.priority'), render: (item) => <span className={`closer-priority closer-priority-${item.event?.priority ?? item.kind}`}>{item.event?.priority === 'urgent' ? <ShieldAlert size={14} /> : item.kind === 'handoff' || item.kind === 'lead_reply' ? <UserRoundCheck size={14} /> : <Clock3 size={14} />}{item.event ? t(`closerEventKinds.${item.event.eventType}`) : t(`closerQueue.kinds.${item.kind}`)}</span> },
    { id: 'account', label: t('closerQueue.columns.accountContact'), render: (item) => <div className="closer-account-cell"><strong>{item.accountName}</strong><small>{item.contactName}</small></div> },
    { id: 'event', label: t('closerQueue.columns.context'), render: (item) => <div className="closer-event-cell"><strong>{item.title}</strong><p>{item.context}</p>{item.event?.eventType === 'interpretation_failure' && <small className="closer-interpretation-reason">{t('closerEventActions.interpretationFailureReason', { reason: item.event.summary })}</small>}{item.event?.status === 'acknowledged' && <small>{t('closerQueue.acknowledged')}</small>}{item.handoff && item.handoff.confirmedFacts.length > 0 && <small>{t('closerQueue.confirmedFacts', { facts: item.handoff.confirmedFacts.join(' · ') })}</small>}{item.handoff && item.handoff.unknowns.length > 0 && <small className="closer-unknowns">{t('closerQueue.openQuestions', { questions: item.handoff.unknowns.join(' · ') })}</small>}{item.event && <div className="closer-event-actions"><button type="button" disabled={acceptingId === item.event.id} onClick={() => void actOnEvent(item.event!, { action: 'snooze', snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() })}>{t('closerEventActions.snoozeOneHour')}</button><button type="button" disabled={acceptingId === item.event.id} onClick={() => void actOnEvent(item.event!, { action: 'resolve' })}>{t('closerEventActions.resolveEvent')}</button><select aria-label={t('closerEventActions.reassignEvent')} value={eventAssignId === item.event.id ? eventAssignTarget : ''} disabled={acceptingId === item.event.id} onChange={(change) => { setEventAssignId(item.event!.id); setEventAssignTarget(change.target.value) }}><option value="">{t('closerEventActions.reassignEvent')}</option>{eventAssignees.filter((assignee) => assignee.id !== item.event!.assignedToUserId).map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select>{eventAssignId === item.event.id && eventAssignTarget && <button type="button" disabled={acceptingId === item.event.id} onClick={() => void actOnEvent(item.event!, { action: 'reassign', assignedToUserId: eventAssignTarget })}>{t('closerEventActions.confirmReassign')}</button>}</div>}<button className="closer-item-action" type="button" disabled={Boolean(acceptingId)} onClick={() => item.handoff ? void acceptHandoff(item.handoff) : item.event ? void openEvent(item.event) : onOpenPipeline()}>{item.handoff ? (acceptingId === item.handoff.id ? t('closerQueue.accepting') : t('closerQueue.acceptAction')) : item.event ? (acceptingId === item.event.id ? t('common.loading') : t('closerQueue.openConversation')) : t('closerQueue.openPipeline')}<ArrowRight size={13} /></button></div> },
    { id: 'deadline', label: t('closerQueue.columns.deadline'), render: (item) => <span className="closer-deadline">{item.deadline ? dateLabel(item.deadline) : '—'}</span> },
  ]
  const handoffCount = items.filter((item) => item.kind === 'handoff').length
  const replyCount = items.filter((item) => Boolean(item.event)).length
  const overdueCount = items.filter((item) => item.kind === 'overdue').length
  const noActionCount = items.filter((item) => item.kind === 'no_action').length
  const pageRows = items.slice(offset, offset + limit)
  const emptyState = <div><strong>{error || t('closerQueue.empty')}</strong>{partial && <p>{t('closerQueue.partial')}</p>}</div>

  return <section className="closer-queue-page">
    <header className="closer-queue-heading"><div><p className="eyebrow">{t('closerQueue.eyebrow')}</p><h2>{t('closerQueue.title')}</h2><p className="muted">{t('closerQueue.description')}</p></div><button className="refresh" type="button" onClick={requestRefresh} aria-label={t('closerQueue.refresh')}><RefreshCw size={16} /></button></header>
    <div className="closer-queue-summary"><article className="summary-handoffs"><span><UserRoundCheck size={15} />{t('closerQueue.summary.handoffs')}</span><strong>{handoffCount}</strong></article><article className="summary-replies"><span><MessageCircle size={15} />{t('closerEventActions.eventsSummary')}</span><strong>{replyCount}</strong></article><article className="summary-overdue"><span><Clock3 size={15} />{t('closerQueue.summary.overdue')}</span><strong>{overdueCount}</strong></article><article><span><ShieldAlert size={15} />{t('closerQueue.summary.noAction')}</span><strong>{noActionCount}</strong></article></div>
    {partial && <p className="closer-queue-partial">{t('closerQueue.partial')}</p>}
    <DataTable rows={pageRows} columns={columns} getRowId={(item) => item.id} sort={{ key: sortKey, direction: sortDirection }} onSortChange={(key, direction) => { setSortKey(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit, offset, total: items.length, hasNextPage: offset + limit < items.length }} onPageChange={setOffset} onPageSizeChange={(size) => { setLimit(size); setOffset(0) }} loading={loading} emptyState={emptyState} filters={<>
      <label className="closer-queue-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder={t('closerQueue.search')} aria-label={t('closerQueue.search')} /></label>
      <label className="closer-queue-filter">{t('closerQueue.filterLabel')}<select value={kindFilter} onChange={(event) => { setKindFilter(event.target.value as WorkKind | ''); setOffset(0) }}><option value="">{t('closerQueue.allTypes')}</option>{(['handoff', 'lead_reply', 'overdue', 'no_action'] as const).map((kind) => <option key={kind} value={kind}>{kind === 'lead_reply' ? t('closerEventActions.eventsFilter') : t(`closerQueue.kinds.${kind}`)}</option>)}</select></label>
    </>} />
  </section>
}

function dateLabel(value: string) { return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
