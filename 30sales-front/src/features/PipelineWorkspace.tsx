import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, ChevronLeft, ChevronRight, Clock3, History, LayoutGrid, List, RefreshCw, Save, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type ActivityDto, type ActivityType, type OpportunityAssigneeDto, type OpportunityDto, type OpportunityHistoryDto, type OpportunityStage, type PipelineStageDto } from '../lib/api/client'
import './Pipeline.css'
import './ActivityTimeline.css'

type PipelineView = 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'
type PipelineMode = 'board' | 'list'
type PipelineSortBy = 'nextActionAt' | 'accountName' | 'contactName' | 'stageChangedAt' | 'opportunityName' | 'stage' | 'ownerName'
type DeadlineFilter = 'any' | 'no_action' | 'overdue' | 'today' | 'next7'
const transitions: Record<OpportunityStage, OpportunityStage[]> = {
  qualification: ['closer_contact_pending', 'lost'], closer_contact_pending: ['discovery_scheduled', 'lost'], discovery_scheduled: ['discovery_done', 'closer_contact_pending', 'lost'],
  discovery_done: ['solution_confirmed', 'proposal_preparing', 'lost'], solution_confirmed: ['proposal_preparing', 'lost'], proposal_preparing: ['proposal_sent', 'lost'],
  proposal_sent: ['negotiation', 'won', 'lost'], negotiation: ['proposal_preparing', 'won', 'lost'], won: [], lost: [],
  custom: [],
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const opportunityId = searchParams.get('opportunityId') ?? undefined
  const [view, setView] = useState<PipelineView>('mine')
  const [mode, setMode] = useState<PipelineMode>('board')
  const [opportunities, setOpportunities] = useState<OpportunityDto[]>([])
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [pageOffset, setPageOffset] = useState(0)
  const [pageInput, setPageInput] = useState('1')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<PipelineSortBy>('nextActionAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [stageFilter, setStageFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>('any')
  const [assignableClosers, setAssignableClosers] = useState<OpportunityAssigneeDto[] | null>(null)
  const [stageSettings, setStageSettings] = useState<{ stages: PipelineStageDto[]; canManage: boolean }>({ stages: [], canManage: false })
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const requestRevision = useRef(0)
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => window.clearTimeout(timer) }, [search])
  useEffect(() => { setPageOffset(0) }, [debouncedSearch, view, stageFilter, ownerFilter, deadlineFilter, pageSize, sortBy, sortDirection])
  useEffect(() => { setPageInput(String(Math.floor(pageOffset / pageSize) + 1)) }, [pageOffset, pageSize, total])
  const selectedStage = stageSettings.stages.find((stage) => stage.key === stageFilter && stage.isActive)
  const deadlineRange = useMemo(() => {
    if (deadlineFilter === 'any') return {}
    if (deadlineFilter === 'no_action') return { noNextAction: true }
    const now = new Date()
    if (deadlineFilter === 'overdue') return { dueBefore: now.toISOString() }
    if (deadlineFilter === 'next7') return { dueAfter: now.toISOString(), dueBefore: new Date(now.getTime() + 7 * 86400000).toISOString() }
    const end = new Date(now); end.setHours(24, 0, 0, 0)
    return { dueAfter: now.toISOString(), dueBefore: end.toISOString() }
  }, [deadlineFilter])
  const listFilters = useMemo(() => ({
    stage: selectedStage?.stage,
    pipelineStageKey: selectedStage?.isSystem ? undefined : selectedStage?.key,
    assignedToUserId: ownerFilter || undefined,
    ...deadlineRange,
  }), [deadlineRange, ownerFilter, selectedStage?.isSystem, selectedStage?.key, selectedStage?.stage])
  const refresh = useCallback(async () => {
    const revision = ++requestRevision.current
    setLoading(true); setLoadingMore(false); setError('')
    try { const [page, settings] = await Promise.all([api.opportunities.listPage({ ...listFilters, view, opportunityId, search: debouncedSearch || undefined, sortBy, sortDirection, limit: pageSize, offset: mode === 'list' ? pageOffset : 0 }), api.opportunities.pipelineStages.list()]); if (revision === requestRevision.current) { setOpportunities(page.data); setTotal(page.pagination.total); setHasMore(page.pagination.hasNextPage); setStageSettings(settings) } }
    catch { if (revision === requestRevision.current) setError(t('errors.loadPipeline')) }
    finally { if (revision === requestRevision.current) setLoading(false) }
  }, [debouncedSearch, deadlineRange, listFilters, mode, opportunityId, pageOffset, pageSize, sortBy, sortDirection, view, t])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { api.opportunities.assignees().then(setAssignableClosers).catch(() => setAssignableClosers(null)) }, [])
  const loadMore = async () => {
    const revision = requestRevision.current
    setLoadingMore(true); setError('')
    try { const page = await api.opportunities.listPage({ ...listFilters, view, opportunityId, search: debouncedSearch || undefined, sortBy, sortDirection, limit: pageSize, offset: opportunities.length }); if (revision === requestRevision.current) { setOpportunities((current) => [...current, ...page.data]); setHasMore(page.pagination.hasNextPage) } }
    catch { if (revision === requestRevision.current) setError(t('errors.loadPipeline')) }
    finally { if (revision === requestRevision.current) setLoadingMore(false) }
  }
  const active = opportunities.filter((item) => !terminal(item.stage))
  const valueByCurrency = active.reduce<Record<string, number>>((totals, item) => { if (item.amount && item.currency) totals[item.currency] = (totals[item.currency] ?? 0) + Number(item.amount); return totals }, {})
  const exposedValue = Object.entries(valueByCurrency).map(([currency, amount]) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)).join(' · ') || '—'
  const atRisk = active.filter((item) => !item.nextActionAt || new Date(item.nextActionAt).getTime() < Date.now() || Date.now() - new Date(item.stageChangedAt).getTime() > 7 * 86400000).length
  const stageCounts = useMemo(() => Object.fromEntries(stageSettings.stages.map((stage) => [stage.key, opportunities.filter((item) => stage.isSystem ? item.stage === stage.stage : item.stage === 'custom' && item.pipelineStageKey === stage.key).length])), [opportunities, stageSettings.stages])
  const clearFilters = () => { setSearch(''); setStageFilter(''); setOwnerFilter(''); setDeadlineFilter('any'); if (opportunityId) setSearchParams({}) }

  return <section className="leads-page pipeline-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('pipeline.eyebrow')}</p><h2>{t('pipeline.title')}</h2><p className="muted">{t('pipeline.description')}</p></div><div className="pipeline-header-actions">{stageSettings.canManage && <button type="button" onClick={() => navigate('/settings/pipeline')}>{t('pipelineStageSettings.openSettings')}</button>}<button className="refresh" onClick={() => void refresh()} aria-label={t('pipeline.refresh')}><RefreshCw size={16} /></button></div></header>
    <div className="pipeline-metrics"><article><span><TrendingUp size={16} />{t('pipeline.openDeals')}</span><strong>{active.length}</strong></article><article><span><CalendarClock size={16} />{t('pipeline.openValue')}</span><strong>{exposedValue}</strong></article><article className={atRisk ? 'risk' : ''}><span><AlertTriangle size={16} />{t('pipeline.atRisk')}</span><strong>{atRisk}</strong></article></div>
    <div className="pipeline-mode-toggle" role="group" aria-label={t('pipelineWorklist.mode')}><button type="button" className={mode === 'board' ? 'selected' : ''} aria-pressed={mode === 'board'} onClick={() => { setMode('board'); setStageFilter(''); setOwnerFilter(''); setDeadlineFilter('any'); setPageOffset(0) }}><LayoutGrid size={15} />{t('pipelineWorklist.boardMode')}</button><button type="button" className={mode === 'list' ? 'selected' : ''} aria-pressed={mode === 'list'} onClick={() => { if (sortBy === 'stageChangedAt') setSortBy('nextActionAt'); setMode('list') }}><List size={15} />{t('pipelineWorklist.listMode')}</button></div>
    <div className="pipeline-views" role="tablist" aria-label={t('pipeline.views')}>
      {(['mine', 'all', 'unassigned', 'no_next_action', 'overdue', 'stale'] as const).map((item) => <button key={item} role="tab" aria-selected={view === item} className={view === item ? 'selected' : ''} onClick={() => { setView(item); setPageOffset(0); if (opportunityId) setSearchParams({}) }}>{t(`pipeline.viewsList.${item}`)}</button>)}
    </div>
    <div className="pipeline-list-controls"><label>{t('pipeline.search')}<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); if (opportunityId) setSearchParams({}) }} placeholder={t('pipelineWorklist.searchHint')} /></label>{mode === 'board' && <><label>{t('pipeline.sortBy')}<select value={sortBy} onChange={(event) => setSortBy(event.target.value as PipelineSortBy)}><option value="nextActionAt">{t('pipeline.sort.nextActionAt')}</option><option value="accountName">{t('pipeline.sort.accountName')}</option><option value="contactName">{t('pipeline.sort.contactName')}</option><option value="stageChangedAt">{t('pipeline.sort.stageChangedAt')}</option><option value="opportunityName">{t('pipelineWorklist.sort.opportunity')}</option><option value="stage">{t('pipelineWorklist.sort.stage')}</option><option value="ownerName">{t('pipelineWorklist.sort.owner')}</option></select></label><button type="button" aria-label={t(sortDirection === 'asc' ? 'pipeline.sortDescending' : 'pipeline.sortAscending')} onClick={() => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')}>{sortDirection === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}{t(sortDirection === 'asc' ? 'pipeline.ascending' : 'pipeline.descending')}</button></>}
      {mode === 'list' && <><label>{t('pipelineWorklist.filterStage')}<select value={stageFilter} onChange={(event) => { const next = stageSettings.stages.find((stage) => stage.key === event.target.value); setStageFilter(event.target.value); if (opportunityId) setSearchParams({}); if (next?.stage === 'won' || next?.stage === 'lost') setView('all') }}><option value="">{t('pipelineWorklist.allStages')}</option>{stageSettings.stages.filter((stage) => stage.isActive).map((stage) => <option key={stage.key} value={stage.key}>{stage.isSystem ? t(`opportunityStages.${stage.stage}`) : stage.name}</option>)}</select></label>{assignableClosers && <label>{t('pipelineWorklist.filterOwner')}<select value={ownerFilter} onChange={(event) => { setOwnerFilter(event.target.value); if (event.target.value) setView('all'); if (opportunityId) setSearchParams({}) }}><option value="">{t('pipelineWorklist.allOwners')}</option><option value="unassigned">{t('pipeline.unassignedOwner')}</option>{assignableClosers.map((closer) => <option key={closer.id} value={closer.id}>{closer.name}</option>)}</select></label>}<label>{t('pipelineWorklist.filterDeadline')}<select value={deadlineFilter} onChange={(event) => { setDeadlineFilter(event.target.value as DeadlineFilter); if (opportunityId) setSearchParams({}) }}><option value="any">{t('pipelineWorklist.deadline.any')}</option><option value="no_action">{t('pipelineWorklist.deadline.noAction')}</option><option value="overdue">{t('pipelineWorklist.deadline.overdue')}</option><option value="today">{t('pipelineWorklist.deadline.today')}</option><option value="next7">{t('pipelineWorklist.deadline.next7')}</option></select></label><button type="button" onClick={clearFilters}>{t('pipelineWorklist.clearFilters')}</button></>}
      <span className="pipeline-result-range">{t('table.range', { from: total ? pageOffset + 1 : 0, to: pageOffset + opportunities.length, total })}</span><label>{t('table.rowsPerPage')}<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPageOffset(0) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label></div>
    {error && opportunities.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    {loading && opportunities.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
    {loading && opportunities.length === 0 ? <WorkspaceState kind="loading" message={t('common.loading')} /> : opportunities.length === 0 ? <WorkspaceState kind={error ? 'error' : 'empty'} message={error || (debouncedSearch || stageFilter || ownerFilter || deadlineFilter !== 'any' ? t('pipeline.emptySearch') : t('pipeline.empty'))} detail={error ? undefined : debouncedSearch || stageFilter || ownerFilter || deadlineFilter !== 'any' ? undefined : t('pipeline.emptyHint')} /> : mode === 'list' ? <CompactOpportunityTable opportunities={opportunities} stages={stageSettings.stages} assignableClosers={assignableClosers} onUpdated={() => void refresh()} sortBy={sortBy} sortDirection={sortDirection} onSort={(key) => { if (key === sortBy) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc'); else { setSortBy(key); setSortDirection('asc') } }} /> : <div className="pipeline-board">
      {stageSettings.stages.filter((stage) => stage.isActive && (stageCounts[stage.key] > 0 || (stage.stage !== 'won' && stage.stage !== 'lost'))).map((stage) => <section className="pipeline-column" key={stage.key}>
        <header><h3>{stage.isSystem ? t(`opportunityStages.${stage.stage}`) : stage.name}</h3><span>{stageCounts[stage.key] ?? 0}</span></header>
        {opportunities.filter((item) => stage.isSystem ? item.stage === stage.stage : item.stage === 'custom' && item.pipelineStageKey === stage.key).map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} stages={stageSettings.stages.filter((item) => item.isActive)} assignableClosers={assignableClosers} onUpdated={() => void refresh()} />)}
        {(stageCounts[stage.key] ?? 0) === 0 && <p className="pipeline-column-empty">{t('pipeline.noDeals')}</p>}
      </section>)}
    </div>}
    {mode === 'board' && hasMore && <button className="pipeline-load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? t('common.loading') : t('pipeline.loadMore')}</button>}
    {mode === 'list' && total > pageSize && <nav className="pipeline-page-navigation" aria-label={t('pipelineWorklist.pagination')}><button type="button" disabled={pageOffset === 0 || loading} onClick={() => setPageOffset((offset) => Math.max(0, offset - pageSize))}><ChevronLeft size={16} />{t('table.previous')}</button><form onSubmit={(event) => { event.preventDefault(); const page = Number(pageInput); const pageCount = Math.ceil(total / pageSize); if (Number.isInteger(page) && page >= 1 && page <= pageCount) setPageOffset((page - 1) * pageSize) }}><label>{t('pipelineWorklist.goToPage')}<input type="number" min={1} max={Math.ceil(total / pageSize)} value={pageInput} onChange={(event) => setPageInput(event.target.value)} /></label><button type="submit">{t('pipelineWorklist.go')}</button><span>{t('table.page', { page: Math.floor(pageOffset / pageSize) + 1, pages: Math.ceil(total / pageSize) })}</span></form><button type="button" disabled={!hasMore || loading} onClick={() => setPageOffset((offset) => offset + pageSize)}>{t('table.next')}<ChevronRight size={16} /></button></nav>}
    <p className="pipeline-note"><Clock3 size={14} />{t('pipeline.staleRule')}{hasMore || mode === 'list' ? ` ${t('pipeline.partialMetrics')}` : ''}</p>
  </section>
}

function CompactOpportunityTable({ opportunities, stages, assignableClosers, onUpdated, sortBy, sortDirection, onSort }: { opportunities: OpportunityDto[]; stages: PipelineStageDto[]; assignableClosers: OpportunityAssigneeDto[] | null; onUpdated: () => void; sortBy: PipelineSortBy; sortDirection: 'asc' | 'desc'; onSort: (key: PipelineSortBy) => void }) {
  const { t, i18n } = useTranslation()
  const stageLabel = (opportunity: OpportunityDto) => {
    if (opportunity.stage === 'custom') return stages.find((stage) => stage.key === opportunity.pipelineStageKey)?.name ?? t('pipelineStageSettings.custom')
    return t(`opportunityStages.${opportunity.stage}`)
  }
  const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(value)) : t('pipeline.actionMissing')
  const columns: Array<{ key: PipelineSortBy; title: string }> = [
    { key: 'opportunityName', title: t('pipelineWorklist.sort.opportunity') },
    { key: 'accountName', title: t('pipelineWorklist.sort.account') },
    { key: 'contactName', title: t('pipelineWorklist.sort.contact') },
    { key: 'stage', title: t('pipelineWorklist.sort.stage') },
    { key: 'ownerName', title: t('pipelineWorklist.sort.owner') },
    { key: 'nextActionAt', title: t('pipelineWorklist.sort.nextAction') },
  ]
  return <div className="pipeline-table-scroll"><table className="pipeline-compact-table"><thead><tr>{columns.map((column) => <th key={column.key} aria-sort={sortBy === column.key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => onSort(column.key)}>{column.title}{sortBy === column.key && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}</button></th>)}</tr></thead><tbody>{opportunities.map((opportunity) => <CompactOpportunityRow key={opportunity.id} opportunity={opportunity} columns={columns} stageLabel={stageLabel(opportunity)} assignableClosers={assignableClosers} stages={stages} onUpdated={onUpdated} dateLabel={dateLabel} />)}</tbody></table></div>
}

function CompactOpportunityRow({ opportunity, columns, stageLabel, assignableClosers, stages, onUpdated, dateLabel }: { opportunity: OpportunityDto; columns: Array<{ key: PipelineSortBy; title: string }>; stageLabel: string; assignableClosers: OpportunityAssigneeDto[] | null; stages: PipelineStageDto[]; onUpdated: () => void; dateLabel: (value: string | null) => string }) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const amountLabel = opportunity.amount && opportunity.currency ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency: opportunity.currency, maximumFractionDigits: 0 }).format(Number(opportunity.amount)) : null
  return <tr>
    <td data-label={columns[0].title}><details className="pipeline-compact-details" onToggle={(event) => setExpanded(event.currentTarget.open)}><summary><span>{opportunity.name}</span>{amountLabel && <small className="pipeline-compact-value">{amountLabel}</small>}</summary>{expanded && <div className="pipeline-compact-expanded"><OpportunityCard opportunity={opportunity} stages={stages} assignableClosers={assignableClosers} onUpdated={onUpdated} /></div>}</details></td>
    <td data-label={columns[1].title}>{opportunity.accountName}</td>
    <td data-label={columns[2].title}><span className="pipeline-compact-contact">{opportunity.contactName}</span>{(opportunity.contactEmail || opportunity.contactPhone) && <small className="pipeline-compact-secondary">{opportunity.contactEmail ?? opportunity.contactPhone}</small>}</td>
    <td data-label={columns[3].title}><span className={opportunity.stage === 'won' ? 'pipeline-stage-pill won' : opportunity.stage === 'lost' ? 'pipeline-stage-pill lost' : 'pipeline-stage-pill'}>{stageLabel}</span></td>
    <td data-label={columns[4].title}>{opportunity.ownerName ?? t('pipeline.unassignedOwner')}</td>
    <td data-label={columns[5].title}><span className={opportunity.nextActionAt && new Date(opportunity.nextActionAt).getTime() < Date.now() ? 'pipeline-overdue-text' : ''}>{opportunity.nextAction ?? t('pipeline.actionMissing')}</span><small className="pipeline-compact-secondary">{dateLabel(opportunity.nextActionAt)}</small></td>
  </tr>
}

function OpportunityCard({ opportunity, stages: availableStages, assignableClosers, onUpdated }: { opportunity: OpportunityDto; stages: PipelineStageDto[]; assignableClosers: OpportunityAssigneeDto[] | null; onUpdated: () => void }) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const currentKey = opportunity.stage === 'custom' ? opportunity.pipelineStageKey ?? '' : opportunity.stage
  const [targetKey, setTargetKey] = useState(currentKey)
  const selectedStage = availableStages.find((item) => item.key === targetKey)
  const targetStage = selectedStage?.stage ?? opportunity.stage
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
  const allowedStages = availableStages.filter((item) => item.key === currentKey || opportunity.stage === 'custom' || item.stage === 'custom' || transitions[opportunity.stage].includes(item.stage))
  const canMove = (opportunity.stage === 'custom' || transitions[opportunity.stage].length > 0) && opportunity.canUpdate
  const dueAt = opportunity.nextActionAt ? new Date(opportunity.nextActionAt) : null
  const overdue = Boolean(dueAt && dueAt.getTime() < Date.now() && !terminal(opportunity.stage))
  const stale = Date.now() - new Date(opportunity.stageChangedAt).getTime() > 7 * 86400000 && !terminal(opportunity.stage)
  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.opportunities.transition(opportunity.id, {
        expectedStage: opportunity.stage, expectedPipelineStageKey: opportunity.stage === 'custom' ? opportunity.pipelineStageKey ?? undefined : undefined, stage: targetStage, pipelineStageKey: targetStage === 'custom' ? selectedStage?.key : undefined, reason: reason.trim() || undefined,
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
    {canMove && <button className="opportunity-edit" onClick={() => { setTargetKey(currentKey); setEditing((value) => !value) }}><TrendingUp size={14} />{t('pipeline.advance')}</button>}
    {editing && <form className="opportunity-transition" onSubmit={submit}>
      <label>{t('pipeline.nextStage')}<select value={targetKey} onChange={(event) => setTargetKey(event.target.value)}>{allowedStages.map((stage) => <option key={stage.key} value={stage.key}>{stage.key === currentKey ? t('pipeline.keepStage') + ' · ' : ''}{stage.isSystem ? t(`opportunityStages.${stage.stage}`) : stage.name}</option>)}</select></label>
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
        const title = item.kind === 'stage' ? item.fromStage ? `${item.fromStage === 'custom' ? item.fromPipelineStageName ?? t('pipelineStageSettings.custom') : t(`opportunityStages.${item.fromStage}`)} → ${item.toStage === 'custom' ? item.toPipelineStageName ?? t('pipelineStageSettings.custom') : t(`opportunityStages.${item.toStage}`)}` : t('pipeline.opportunityCreated') : `${t(`activityTypes.${item.type}`)} · ${item.subject}`
        const details = item.kind === 'stage' ? item.reason : item.details
        return <li key={`${item.kind}-${item.id}`}><span>{title}</span><small>{item.actorName} · {formatDate(item.timestamp)}</small>{details && <p>{details}</p>}{item.kind === 'activity' && item.result && <p><strong>{t('pipeline.activityResult')}:</strong> {item.result}</p>}</li>
      })}</ol>}
    </div>}
  </article>
}
