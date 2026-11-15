import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, Clock3, History, RefreshCw, Save, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type ActivityDto, type ActivityType, type OpportunityAssigneeDto, type OpportunityDto, type OpportunityHistoryDto, type OpportunityStage } from '../lib/api/client'
import './Pipeline.css'
import './ActivityTimeline.css'

type PipelineView = 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'
const stages: OpportunityStage[] = ['qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost']
const transitions: Record<OpportunityStage, OpportunityStage[]> = {
  qualification: ['closer_contact_pending', 'lost'], closer_contact_pending: ['discovery_scheduled', 'lost'], discovery_scheduled: ['discovery_done', 'closer_contact_pending', 'lost'],
  discovery_done: ['solution_confirmed', 'proposal_preparing', 'lost'], solution_confirmed: ['proposal_preparing', 'lost'], proposal_preparing: ['proposal_sent', 'lost'],
  proposal_sent: ['negotiation', 'won', 'lost'], negotiation: ['proposal_preparing', 'won', 'lost'], won: [], lost: [],
}
const terminal = (stage: OpportunityStage) => stage === 'won' || stage === 'lost'
const activityTypes: ActivityType[] = ['call', 'meeting', 'email', 'message', 'task', 'note', 'research']
function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function PipelineWorkspace() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const opportunityId = searchParams.get('opportunityId') ?? undefined
  const [view, setView] = useState<PipelineView>('mine')
  const [opportunities, setOpportunities] = useState<OpportunityDto[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<'nextActionAt' | 'accountName' | 'contactName' | 'stageChangedAt'>('nextActionAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [assignableClosers, setAssignableClosers] = useState<OpportunityAssigneeDto[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const requestRevision = useRef(0)
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => window.clearTimeout(timer) }, [search])
  const refresh = useCallback(async () => {
    const revision = ++requestRevision.current
    setLoading(true); setLoadingMore(false); setError('')
    try { const page = await api.opportunities.listPage({ view, opportunityId, search: debouncedSearch || undefined, sortBy, sortDirection, limit: pageSize, offset: 0 }); if (revision === requestRevision.current) { setOpportunities(page.data); setTotal(page.pagination.total); setHasMore(page.pagination.hasNextPage) } }
    catch { if (revision === requestRevision.current) setError(t('errors.loadPipeline')) }
    finally { if (revision === requestRevision.current) setLoading(false) }
  }, [debouncedSearch, opportunityId, pageSize, sortBy, sortDirection, view, t])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { api.opportunities.assignees().then(setAssignableClosers).catch(() => setAssignableClosers(null)) }, [])
  const loadMore = async () => {
    const revision = requestRevision.current
    setLoadingMore(true); setError('')
    try { const page = await api.opportunities.listPage({ view, opportunityId, search: debouncedSearch || undefined, sortBy, sortDirection, limit: pageSize, offset: opportunities.length }); if (revision === requestRevision.current) { setOpportunities((current) => [...current, ...page.data]); setHasMore(page.pagination.hasNextPage) } }
    catch { if (revision === requestRevision.current) setError(t('errors.loadPipeline')) }
    finally { if (revision === requestRevision.current) setLoadingMore(false) }
  }
  const active = opportunities.filter((item) => !terminal(item.stage))
  const valueByCurrency = active.reduce<Record<string, number>>((totals, item) => { if (item.amount && item.currency) totals[item.currency] = (totals[item.currency] ?? 0) + Number(item.amount); return totals }, {})
  const exposedValue = Object.entries(valueByCurrency).map(([currency, amount]) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)).join(' · ') || '—'
  const atRisk = active.filter((item) => !item.nextActionAt || new Date(item.nextActionAt).getTime() < Date.now() || Date.now() - new Date(item.stageChangedAt).getTime() > 7 * 86400000).length
  const stageCounts = useMemo(() => Object.fromEntries(stages.map((stage) => [stage, opportunities.filter((item) => item.stage === stage).length])) as Record<OpportunityStage, number>, [opportunities])

  return <section className="leads-page pipeline-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('pipeline.eyebrow')}</p><h2>{t('pipeline.title')}</h2><p className="muted">{t('pipeline.description')}</p></div><button className="refresh" onClick={() => void refresh()} aria-label={t('pipeline.refresh')}><RefreshCw size={16} /></button></header>
    <div className="pipeline-metrics"><article><span><TrendingUp size={16} />{t('pipeline.openDeals')}</span><strong>{active.length}</strong></article><article><span><CalendarClock size={16} />{t('pipeline.openValue')}</span><strong>{exposedValue}</strong></article><article className={atRisk ? 'risk' : ''}><span><AlertTriangle size={16} />{t('pipeline.atRisk')}</span><strong>{atRisk}</strong></article></div>
    <div className="pipeline-views" role="tablist" aria-label={t('pipeline.views')}>
      {(['mine', 'all', 'unassigned', 'no_next_action', 'overdue', 'stale'] as const).map((item) => <button key={item} role="tab" aria-selected={view === item} className={view === item ? 'selected' : ''} onClick={() => { setView(item); if (opportunityId) setSearchParams({}) }}>{t(`pipeline.viewsList.${item}`)}</button>)}
    </div>
    <div className="pipeline-list-controls"><label>{t('pipeline.search')}<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); if (opportunityId) setSearchParams({}) }} placeholder={t('pipeline.searchHint')} /></label><label>{t('pipeline.sortBy')}<select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="nextActionAt">{t('pipeline.sort.nextActionAt')}</option><option value="accountName">{t('pipeline.sort.accountName')}</option><option value="contactName">{t('pipeline.sort.contactName')}</option><option value="stageChangedAt">{t('pipeline.sort.stageChangedAt')}</option></select></label><button type="button" aria-label={t(sortDirection === 'asc' ? 'pipeline.sortDescending' : 'pipeline.sortAscending')} onClick={() => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')}>{sortDirection === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}{t(sortDirection === 'asc' ? 'pipeline.ascending' : 'pipeline.descending')}</button><span className="pipeline-result-range">{t('table.range', { from: total ? 1 : 0, to: opportunities.length, total })}</span><label>{t('table.rowsPerPage')}<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label></div>
    {error && opportunities.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    {loading && opportunities.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
    {loading && opportunities.length === 0 ? <WorkspaceState kind="loading" message={t('common.loading')} /> : opportunities.length === 0 ? <WorkspaceState kind={error ? 'error' : 'empty'} message={error || (debouncedSearch ? t('pipeline.emptySearch') : t('pipeline.empty'))} detail={error ? undefined : debouncedSearch ? undefined : t('pipeline.emptyHint')} /> : <div className="pipeline-board">
      {stages.filter((stage) => stageCounts[stage] > 0 || !terminal(stage)).map((stage) => <section className="pipeline-column" key={stage}>
        <header><h3>{t(`opportunityStages.${stage}`)}</h3><span>{stageCounts[stage]}</span></header>
        {opportunities.filter((item) => item.stage === stage).map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} assignableClosers={assignableClosers} onUpdated={() => void refresh()} />)}
        {stageCounts[stage] === 0 && <p className="pipeline-column-empty">{t('pipeline.noDeals')}</p>}
      </section>)}
    </div>}
    {hasMore && <button className="pipeline-load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? t('common.loading') : t('pipeline.loadMore')}</button>}
    <p className="pipeline-note"><Clock3 size={14} />{t('pipeline.staleRule')}{hasMore ? ` ${t('pipeline.partialMetrics')}` : ''}</p>
  </section>
}

function OpportunityCard({ opportunity, assignableClosers, onUpdated }: { opportunity: OpportunityDto; assignableClosers: OpportunityAssigneeDto[] | null; onUpdated: () => void }) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [targetStage, setTargetStage] = useState<OpportunityStage>(transitions[opportunity.stage][0] ?? opportunity.stage)
  const [nextAction, setNextAction] = useState(opportunity.nextAction ?? '')
  const [nextActionAt, setNextActionAt] = useState(localDateTime(opportunity.nextActionAt ?? undefined))
  const [amount, setAmount] = useState(opportunity.amount ?? '')
  const [currency, setCurrency] = useState(opportunity.currency ?? 'BRL')
  const [closedAt, setClosedAt] = useState(localDateTime())
  const [lossReason, setLossReason] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<OpportunityHistoryDto[] | null>(null)
  const [activities, setActivities] = useState<ActivityDto[] | null>(null)
  const [activityType, setActivityType] = useState<ActivityType>('call')
  const [activitySubject, setActivitySubject] = useState('')
  const [activityDetails, setActivityDetails] = useState('')
  const [activityResult, setActivityResult] = useState('')
  const [activityOccurredAt, setActivityOccurredAt] = useState(localDateTime())
  const [activitySaving, setActivitySaving] = useState(false)
  const [ownerSaving, setOwnerSaving] = useState(false)
  const canMove = transitions[opportunity.stage].length > 0 && opportunity.canUpdate
  const dueAt = opportunity.nextActionAt ? new Date(opportunity.nextActionAt) : null
  const overdue = Boolean(dueAt && dueAt.getTime() < Date.now() && !terminal(opportunity.stage))
  const stale = Date.now() - new Date(opportunity.stageChangedAt).getTime() > 7 * 86400000 && !terminal(opportunity.stage)
  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.opportunities.transition(opportunity.id, {
        expectedStage: opportunity.stage, stage: targetStage, reason: reason.trim() || undefined,
        nextAction: terminal(targetStage) ? undefined : nextAction.trim(), nextActionAt: terminal(targetStage) ? undefined : new Date(nextActionAt).toISOString(),
        amount: targetStage === 'won' ? amount : !terminal(targetStage) && amount ? amount : undefined, currency: targetStage === 'won' || (!terminal(targetStage) && amount) ? currency : undefined,
        closedAt: targetStage === 'won' ? new Date(closedAt).toISOString() : undefined,
        lossReason: targetStage === 'lost' ? lossReason.trim() : undefined,
      })
      setEditing(false); onUpdated()
    } catch { setError(t('errors.updateOpportunity')) }
    finally { setSaving(false) }
  }
  const toggleTimeline = async () => {
    if (history !== null || activities !== null) { setHistory(null); setActivities(null); return }
    try {
      const [stageHistory, activityList] = await Promise.all([api.opportunities.history(opportunity.id), api.opportunities.activities.list(opportunity.id)])
      setHistory(stageHistory); setActivities(activityList); setError('')
    } catch { setError(t('errors.loadOpportunityHistory')) }
  }
  const submitActivity = async (event: React.FormEvent) => {
    event.preventDefault(); setActivitySaving(true); setError('')
    try {
      const activity = await api.opportunities.activities.create(opportunity.id, { type: activityType, subject: activitySubject.trim(), details: activityDetails.trim() || undefined, result: activityResult.trim() || undefined, occurredAt: new Date(activityOccurredAt).toISOString() })
      setActivities((current) => [activity, ...(current ?? [])]); setActivitySubject(''); setActivityDetails(''); setActivityResult(''); setActivityOccurredAt(localDateTime())
    } catch { setError(t('errors.createActivity')) }
    finally { setActivitySaving(false) }
  }
  const assignOwner = async (ownerUserId: string) => {
    setOwnerSaving(true); setError('')
    try { await api.opportunities.assignOwner(opportunity.id, ownerUserId || null); onUpdated() }
    catch { setError(t('opportunityAssignment.failed')) }
    finally { setOwnerSaving(false) }
  }
  const timeline = [
    ...(activities ?? []).map((item) => ({ ...item, kind: 'activity' as const, timestamp: item.occurredAt })),
    ...(history ?? []).map((item) => ({ ...item, kind: 'stage' as const, timestamp: item.occurredAt })),
  ].sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())

  return <article className={`opportunity-card${overdue || !opportunity.nextActionAt ? ' at-risk' : ''}`}>
    <div className="opportunity-card-top"><strong>{opportunity.name}</strong>{stale && <span className="stale-flag">{t('pipeline.stale')}</span>}</div>
    <p className="opportunity-person">{opportunity.contactName} · {opportunity.ownerName ?? t('pipeline.unassignedOwner')}</p>
    {!terminal(opportunity.stage) && assignableClosers && <label className="opportunity-owner-picker">{t('opportunityAssignment.assignCloser')}<select aria-label={t('opportunityAssignment.assignCloserFor', { opportunity: opportunity.name })} value={opportunity.ownerUserId ?? ''} disabled={ownerSaving} onChange={(event) => void assignOwner(event.target.value)}><option value="">{t('pipeline.unassignedOwner')}</option>{assignableClosers.map((closer) => <option key={closer.id} value={closer.id}>{closer.name}</option>)}</select></label>}
    {(opportunity.contactEmail || opportunity.contactPhone) && <p className="opportunity-channel">{opportunity.contactEmail ?? opportunity.contactPhone}</p>}
    <div className={`opportunity-next${overdue || !opportunity.nextActionAt ? ' overdue' : ''}`}>
      {opportunity.nextActionAt ? <><CalendarClock size={14} /><span><strong>{opportunity.nextAction ?? t('pipeline.actionMissing')}</strong><small>{formatDate(opportunity.nextActionAt)}</small></span></> : <><AlertTriangle size={14} /><span><strong>{t('pipeline.actionMissing')}</strong><small>{t('pipeline.addNextAction')}</small></span></>}
    </div>
    {opportunity.amount && <p className="opportunity-value">{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: opportunity.currency ?? 'BRL' }).format(Number(opportunity.amount))}</p>}
    {opportunity.lossReason && <p className="opportunity-loss">{t('pipeline.lossReason')}: {opportunity.lossReason}</p>}
    {canMove && <button className="opportunity-edit" onClick={() => { setTargetStage(opportunity.stage); setEditing((value) => !value) }}><TrendingUp size={14} />{t('pipeline.advance')}</button>}
    {editing && <form className="opportunity-transition" onSubmit={submit}>
      <label>{t('pipeline.nextStage')}<select value={targetStage} onChange={(event) => setTargetStage(event.target.value as OpportunityStage)}><option value={opportunity.stage}>{t(`pipeline.keepStage`)} · {t(`opportunityStages.${opportunity.stage}`)}</option>{transitions[opportunity.stage].map((stage) => <option key={stage} value={stage}>{t(`opportunityStages.${stage}`)}</option>)}</select></label>
      {targetStage === 'won' ? <div className="pipeline-conditional"><label>{t('pipeline.amount')}<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>{t('pipeline.currency')}<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} required /></label><label>{t('pipeline.closedAt')}<input type="datetime-local" value={closedAt} onChange={(event) => setClosedAt(event.target.value)} required /></label></div> : targetStage === 'lost' ? <label>{t('pipeline.lossReason')}<textarea value={lossReason} onChange={(event) => setLossReason(event.target.value)} minLength={3} maxLength={1000} required /></label> : <><div className="pipeline-conditional"><label>{t('pipeline.nextAction')}<input value={nextAction} onChange={(event) => setNextAction(event.target.value)} minLength={3} maxLength={500} required /></label><label>{t('pipeline.nextActionAt')}<input type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} required /></label></div><div className="pipeline-conditional"><label>{t('pipeline.estimatedAmount')}<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>{t('pipeline.currency')}<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} /></label></div></>}
      <label>{targetStage === opportunity.stage ? t('pipeline.updateReason') : t('pipeline.transitionNote')}<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={targetStage === opportunity.stage ? 3 : undefined} maxLength={1000} required={targetStage === opportunity.stage} /></label>
      {error && <p className="error">{error}</p>}<button className="primary" disabled={saving}>{saving ? t('common.saving') : t('pipeline.saveTransition')}<Save size={14} /></button>
    </form>}
    <button className="opportunity-history-toggle" onClick={() => void toggleTimeline()}><History size={13} />{activities === null ? t('pipeline.timeline') : t('pipeline.hideHistory')}</button>
    {activities !== null && <div className="opportunity-timeline">
      {opportunity.canUpdate && <form className="activity-form" onSubmit={submitActivity}>
        <strong>{t('pipeline.logActivity')}</strong>
        <div className="activity-form-fields"><label>{t('pipeline.activityType')}<select value={activityType} onChange={(event) => setActivityType(event.target.value as ActivityType)}>{activityTypes.map((type) => <option key={type} value={type}>{t(`activityTypes.${type}`)}</option>)}</select></label><label>{t('pipeline.activitySubject')}<input value={activitySubject} onChange={(event) => setActivitySubject(event.target.value)} minLength={2} maxLength={240} required /></label><label>{t('pipeline.occurredAt')}<input type="datetime-local" value={activityOccurredAt} onChange={(event) => setActivityOccurredAt(event.target.value)} required /></label><label>{t('pipeline.activityResult')}<input value={activityResult} onChange={(event) => setActivityResult(event.target.value)} maxLength={1000} /></label><label className="activity-details-field">{t('pipeline.activityDetails')}<textarea value={activityDetails} onChange={(event) => setActivityDetails(event.target.value)} maxLength={5000} /></label></div>
        {error && <p className="error">{error}</p>}<button className="primary" disabled={activitySaving}>{activitySaving ? t('common.saving') : t('pipeline.saveActivity')}</button>
      </form>}
      {timeline.length === 0 ? <p className="activity-empty">{t('pipeline.noTimeline')}</p> : <ol className="opportunity-history">{timeline.map((item) => {
        const title = item.kind === 'stage' ? item.fromStage ? `${t(`opportunityStages.${item.fromStage}`)} → ${t(`opportunityStages.${item.toStage}`)}` : t('pipeline.opportunityCreated') : `${t(`activityTypes.${item.type}`)} · ${item.subject}`
        const details = item.kind === 'stage' ? item.reason : item.details
        return <li key={`${item.kind}-${item.id}`}><span>{title}</span><small>{item.actorName} · {formatDate(item.timestamp)}</small>{details && <p>{details}</p>}{item.kind === 'activity' && item.result && <p><strong>{t('pipeline.activityResult')}:</strong> {item.result}</p>}</li>
      })}</ol>}
    </div>}
  </article>
}
