import { Button, CalendarField, CurrencyField, NumericField, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, CalendarClock, ChevronLeft, ChevronRight, Clock3, History, LayoutGrid, List, Mail, MessageSquarePlus, Phone, RefreshCw, Save, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import { api, type ActivityDto, type ActivityType, type OpportunityAssigneeDto, type OpportunityConversationContextDto, type OpportunityDto, type OpportunityHistoryDto, type OpportunityPipelineSummaryDto, type OpportunityStage, type PipelineStageDto, type PipelinesDto } from '../lib/api'
import './Pipeline.css'
import './ActivityTimeline.css'

type PipelineView = 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'
type PipelineMode = 'board' | 'list'
type PipelineSortBy = 'nextActionAt' | 'accountName' | 'contactName' | 'stageChangedAt' | 'opportunityName' | 'stage' | 'ownerName'
type DeadlineFilter = 'any' | 'no_action' | 'overdue' | 'today' | 'next7'
const pipelineSortOptions = ['nextActionAt', 'accountName', 'contactName', 'stageChangedAt', 'opportunityName', 'stage', 'ownerName'] as const satisfies readonly PipelineSortBy[]
const deadlineFilters = ['any', 'no_action', 'overdue', 'today', 'next7'] as const satisfies readonly DeadlineFilter[]
const transitions: Record<OpportunityStage, OpportunityStage[]> = {
  qualification: ['closer_contact_pending', 'lost'], closer_contact_pending: ['discovery_scheduled', 'lost'], discovery_scheduled: ['discovery_done', 'closer_contact_pending', 'lost'],
  discovery_done: ['solution_confirmed', 'proposal_preparing', 'lost'], solution_confirmed: ['proposal_preparing', 'lost'], proposal_preparing: ['proposal_sent', 'lost'],
  proposal_sent: ['negotiation', 'won', 'lost'], negotiation: ['proposal_preparing', 'won', 'lost'], won: [], lost: [],
  custom: [],
}
const terminal = (stage: OpportunityStage) => stage === 'won' || stage === 'lost'
const activityTypes: ActivityType[] = ['call', 'meeting', 'email', 'message', 'task', 'note', 'research']
function isPipelineSortBy(value: string): value is PipelineSortBy { return pipelineSortOptions.some((option) => option === value) }
function isDeadlineFilter(value: string): value is DeadlineFilter { return deadlineFilters.some((option) => option === value) }
function isActivityType(value: string): value is ActivityType { return activityTypes.some((option) => option === value) }
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
  const [summary, setSummary] = useState<OpportunityPipelineSummaryDto | null>(null)
  const [summaryFailed, setSummaryFailed] = useState(false)
  const [pipelines, setPipelines] = useState<PipelinesDto | null>(null)
  const [selectedPipelineId, setSelectedPipelineId] = useState('')
  const [total, setTotal] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [pageOffset, setPageOffset] = useState(0)
  const [pageInput, setPageInput] = useState<number | null>(1)
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
  const [dropEvent, setDropEvent] = useState<{ opportunityId: string; stageKey: string } | null>(null)
  const requestRevision = useRef(0)
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => window.clearTimeout(timer) }, [search])
  useEffect(() => { setPageOffset(0) }, [debouncedSearch, view, stageFilter, ownerFilter, deadlineFilter, pageSize, sortBy, sortDirection])
  useEffect(() => { setPageInput(Math.floor(pageOffset / pageSize) + 1) }, [pageOffset, pageSize, total])
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
    try {
      const pipelineData = await api.opportunities.pipelines.list()
      const pipelineId = selectedPipelineId && pipelineData.pipelines.some((item) => item.id === selectedPipelineId) ? selectedPipelineId : pipelineData.defaultPipelineId
      const [page, settings, nextSummary] = await Promise.all([
        api.opportunities.listPage({ ...listFilters, pipelineId, view, opportunityId, search: debouncedSearch || undefined, sortBy, sortDirection, limit: pageSize, offset: mode === 'list' ? pageOffset : 0 }),
        api.opportunities.pipelineStages.list(pipelineId),
        api.opportunities.summary({ ...listFilters, pipelineId, view, search: debouncedSearch || undefined }).then((result) => ({ result, failed: false as const })).catch(() => ({ result: null, failed: true as const })),
      ])
      if (revision === requestRevision.current) { setPipelines(pipelineData); setSelectedPipelineId(pipelineId); setOpportunities(page.data); setTotal(page.pagination.total); setHasMore(page.pagination.hasNextPage); setStageSettings(settings); setSummary(nextSummary.result); setSummaryFailed(nextSummary.failed) }
    }
    catch { if (revision === requestRevision.current) setError(t('errors.loadPipeline')) }
    finally { if (revision === requestRevision.current) setLoading(false) }
  }, [debouncedSearch, deadlineRange, listFilters, mode, opportunityId, pageOffset, pageSize, selectedPipelineId, sortBy, sortDirection, view, t])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { api.opportunities.assignees().then(setAssignableClosers).catch(() => setAssignableClosers(null)) }, [])
  const loadMore = async () => {
    const revision = requestRevision.current
    setLoadingMore(true); setError('')
    try { const page = await api.opportunities.listPage({ ...listFilters, pipelineId: selectedPipelineId, view, opportunityId, search: debouncedSearch || undefined, sortBy, sortDirection, limit: pageSize, offset: opportunities.length }); if (revision === requestRevision.current) { setOpportunities((current) => [...current, ...page.data]); setHasMore(page.pagination.hasNextPage) } }
    catch { if (revision === requestRevision.current) setError(t('errors.loadPipeline')) }
    finally { if (revision === requestRevision.current) setLoadingMore(false) }
  }
  const exposedValue = summary?.openValueByCurrency.map(({ currency, amount }) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount))).join(' · ') || '—'
  const stageCounts = useMemo(() => Object.fromEntries(stageSettings.stages.map((stage) => [stage.key, summary?.stageCounts.filter((item) => stage.isSystem ? item.stage === stage.stage : item.pipelineStageKey === stage.key).reduce((totalCount, item) => totalCount + item.count, 0) ?? 0])), [stageSettings.stages, summary])
  const clearFilters = () => { setSearch(''); setStageFilter(''); setOwnerFilter(''); setDeadlineFilter('any'); if (opportunityId) setSearchParams({}) }

  return <section className="leads-page pipeline-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('pipeline.eyebrow')}</p><h2>{t('pipeline.title')}</h2><p className="muted">{t('pipeline.description')}</p></div><div className="pipeline-header-actions">{pipelines && <label className="pipeline-select-label">{t('pipeline.selectPipeline')}<SelectField value={selectedPipelineId} onChange={(event) => { const nextPipeline = pipelines.pipelines.find((item) => item.id === event.target.value); if (!nextPipeline) return; setSelectedPipelineId(nextPipeline.id); setStageFilter(''); setPageOffset(0) }}>{pipelines.pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? ` · ${t('pipeline.defaultPipeline')}` : ''}</option>)}</SelectField></label>}{stageSettings.canManage && <Button type="button" onClick={() => navigate('/settings/pipeline')}>{t('pipelineStageSettings.openSettings')}</Button>}<Button className="refresh" onClick={() => void refresh()} aria-label={t('pipeline.refresh')}><RefreshCw size={16} /></Button></div></header>
    <div className="pipeline-metrics"><article><span><TrendingUp size={16} />{t('pipeline.openDeals')}</span><strong>{summary ? summary.openCount : '—'}</strong></article><article><span><CalendarClock size={16} />{t('pipeline.openValue')}</span><strong>{summary ? exposedValue : '—'}</strong></article><article className={summary?.atRiskCount ? 'risk' : ''}><span><AlertTriangle size={16} />{t('pipeline.atRisk')}</span><strong>{summary ? summary.atRiskCount : '—'}</strong></article></div>
    {summaryFailed && <WorkspaceState kind="error" compact message={t('errors.loadPipeline')} />}
    <div className="pipeline-mode-toggle" role="group" aria-label={t('pipelineWorklist.mode')}><Button type="button" className={mode === 'board' ? 'selected' : ''} aria-pressed={mode === 'board'} onClick={() => setMode('board')}><LayoutGrid size={15} />{t('pipelineWorklist.boardMode')}</Button><Button type="button" className={mode === 'list' ? 'selected' : ''} aria-pressed={mode === 'list'} onClick={() => { if (sortBy === 'stageChangedAt') setSortBy('nextActionAt'); setMode('list') }}><List size={15} />{t('pipelineWorklist.listMode')}</Button></div>
    <div className="pipeline-views" role="tablist" aria-label={t('pipeline.views')}>
      {(['mine', 'all', 'unassigned', 'no_next_action', 'overdue', 'stale'] as const).map((item) => <Button key={item} role="tab" aria-selected={view === item} className={view === item ? 'selected' : ''} onClick={() => { setView(item); setPageOffset(0); if (opportunityId) setSearchParams({}) }}>{t(`pipeline.viewsList.${item}`)}</Button>)}
    </div>
    <div className="pipeline-list-controls"><label>{t('pipeline.search')}<TextField type="search" value={search} onChange={(event) => { setSearch(event.target.value); if (opportunityId) setSearchParams({}) }} placeholder={t('pipelineWorklist.searchHint')} /></label>{mode === 'board' && <><label>{t('pipeline.sortBy')}<SelectField value={sortBy} onChange={(event) => { if (isPipelineSortBy(event.target.value)) setSortBy(event.target.value) }}><option value="nextActionAt">{t('pipeline.sort.nextActionAt')}</option><option value="accountName">{t('pipeline.sort.accountName')}</option><option value="contactName">{t('pipeline.sort.contactName')}</option><option value="stageChangedAt">{t('pipeline.sort.stageChangedAt')}</option><option value="opportunityName">{t('pipelineWorklist.sort.opportunity')}</option><option value="stage">{t('pipelineWorklist.sort.stage')}</option><option value="ownerName">{t('pipelineWorklist.sort.owner')}</option></SelectField></label><Button type="button" aria-label={t(sortDirection === 'asc' ? 'pipeline.sortDescending' : 'pipeline.sortAscending')} onClick={() => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')}>{sortDirection === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}{t(sortDirection === 'asc' ? 'pipeline.ascending' : 'pipeline.descending')}</Button></>}
      <label>{t('pipelineWorklist.filterStage')}<SelectField value={stageFilter} onChange={(event) => { const value = event.target.value; const next = stageSettings.stages.find((stage) => stage.key === value && stage.isActive); if (value && !next) return; setStageFilter(next?.key ?? ''); if (opportunityId) setSearchParams({}); if (next?.stage === 'won' || next?.stage === 'lost') setView('all') }}><option value="">{t('pipelineWorklist.allStages')}</option>{stageSettings.stages.filter((stage) => stage.isActive).map((stage) => <option key={stage.key} value={stage.key}>{stage.isSystem ? t(`opportunityStages.${stage.stage}`) : stage.name}</option>)}</SelectField></label>{assignableClosers && <label>{t('pipelineWorklist.filterOwner')}<SelectField value={ownerFilter} onChange={(event) => { const value = event.target.value; if (value && value !== 'unassigned' && !assignableClosers.some((closer) => closer.id === value)) return; setOwnerFilter(value); if (value) setView('all'); if (opportunityId) setSearchParams({}) }}><option value="">{t('pipelineWorklist.allOwners')}</option><option value="unassigned">{t('pipeline.unassignedOwner')}</option>{assignableClosers.map((closer) => <option key={closer.id} value={closer.id}>{closer.name}</option>)}</SelectField></label>}<label>{t('pipelineWorklist.filterDeadline')}<SelectField value={deadlineFilter} onChange={(event) => { if (!isDeadlineFilter(event.target.value)) return; setDeadlineFilter(event.target.value); if (opportunityId) setSearchParams({}) }}><option value="any">{t('pipelineWorklist.deadline.any')}</option><option value="no_action">{t('pipelineWorklist.deadline.noAction')}</option><option value="overdue">{t('pipelineWorklist.deadline.overdue')}</option><option value="today">{t('pipelineWorklist.deadline.today')}</option><option value="next7">{t('pipelineWorklist.deadline.next7')}</option></SelectField></label>{Boolean(search || stageFilter || ownerFilter || deadlineFilter !== 'any') && <Button type="button" onClick={clearFilters}>{t('pipelineWorklist.clearFilters')}</Button>}
    </div>
    {error && opportunities.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    {loading && opportunities.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
    {loading && opportunities.length === 0 ? <WorkspaceState kind="loading" message={t('common.loading')} /> : opportunities.length === 0 ? <WorkspaceState kind={error ? 'error' : 'empty'} message={error || (debouncedSearch || stageFilter || ownerFilter || deadlineFilter !== 'any' ? t('pipeline.emptySearch') : t('pipeline.empty'))} detail={error ? undefined : debouncedSearch || stageFilter || ownerFilter || deadlineFilter !== 'any' ? undefined : t('pipeline.emptyHint')} /> : mode === 'list' ? <CompactOpportunityTable opportunities={opportunities} stages={stageSettings.stages} pipelines={pipelines?.pipelines ?? []} canManagePipeline={pipelines?.canManage ?? false} assignableClosers={assignableClosers} onUpdated={() => void refresh()} sortBy={sortBy} sortDirection={sortDirection} onSort={(key) => { if (key === sortBy) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc'); else { setSortBy(key); setSortDirection('asc') } }} /> : <>
      <p className="pipeline-drag-hint">{t('pipeline.dragHint')}</p>
      <div className="pipeline-board">
      {stageSettings.stages.filter((stage) => stage.isActive).map((stage) => <PipelineColumn key={stage.key} stage={stage} title={stage.isSystem ? t(`opportunityStages.${stage.stage}`) : stage.name ?? t('pipelineWorklist.untitledStage')} count={stageCounts[stage.key] ?? 0} opportunities={opportunities.filter((item) => stage.isSystem ? item.stage === stage.stage : item.stage === 'custom' && item.pipelineStageKey === stage.key)} allStages={stageSettings.stages.filter((item) => item.isActive)} pipelines={pipelines?.pipelines ?? []} canManagePipeline={pipelines?.canManage ?? false} assignableClosers={assignableClosers} onUpdated={() => void refresh()} onDrop={(opportunityId, stageKey) => setDropEvent({ opportunityId, stageKey })} onDropHandled={() => setDropEvent(null)} dropEvent={dropEvent} />)}
      </div>
    </>}
    {mode === 'board' && hasMore && <Button className="pipeline-load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? t('common.loading') : t('pipeline.loadMore')}</Button>}
    {mode === 'list' && <footer className="pipeline-list-footer"><div className="pipeline-list-footer-summary"><span>{t('table.range', { from: total ? pageOffset + 1 : 0, to: pageOffset + opportunities.length, total })}</span><label>{t('table.rowsPerPage')}<SelectField value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPageOffset(0) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></SelectField></label></div>{total > pageSize && <nav className="pipeline-page-navigation" aria-label={t('pipelineWorklist.pagination')}><Button type="button" disabled={pageOffset === 0 || loading} onClick={() => setPageOffset((offset) => Math.max(0, offset - pageSize))}><ChevronLeft size={16} />{t('table.previous')}</Button><form onSubmit={(event) => { event.preventDefault(); const page = pageInput; const pageCount = Math.ceil(total / pageSize); if (page !== null && Number.isInteger(page) && page >= 1 && page <= pageCount) setPageOffset((page - 1) * pageSize) }}><label>{t('pipelineWorklist.goToPage')}<NumericField mode="integer" min={1} max={Math.ceil(total / pageSize)} value={pageInput} onValueChange={setPageInput} /></label><Button type="submit">{t('pipelineWorklist.go')}</Button><span>{t('table.page', { page: Math.floor(pageOffset / pageSize) + 1, pages: Math.ceil(total / pageSize) })}</span></form><Button type="button" disabled={!hasMore || loading} onClick={() => setPageOffset((offset) => offset + pageSize)}>{t('table.next')}<ChevronRight size={16} /></Button></nav>}</footer>}
    <p className="pipeline-note"><Clock3 size={14} />{t('pipeline.staleRule')}</p>
  </section>
}

function CompactOpportunityTable({ opportunities, stages, pipelines, canManagePipeline, assignableClosers, onUpdated, sortBy, sortDirection, onSort }: { opportunities: OpportunityDto[]; stages: PipelineStageDto[]; pipelines: PipelinesDto['pipelines']; canManagePipeline: boolean; assignableClosers: OpportunityAssigneeDto[] | null; onUpdated: () => void; sortBy: PipelineSortBy; sortDirection: 'asc' | 'desc'; onSort: (key: PipelineSortBy) => void }) {
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
  return <div className="pipeline-table-scroll"><table className="pipeline-compact-table"><thead><tr>{columns.map((column) => <th key={column.key} aria-sort={sortBy === column.key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><Button type="button" onClick={() => onSort(column.key)}>{column.title}{sortBy === column.key && (sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}</Button></th>)}</tr></thead><tbody>{opportunities.map((opportunity) => <CompactOpportunityRow key={opportunity.id} opportunity={opportunity} columns={columns} stageLabel={stageLabel(opportunity)} assignableClosers={assignableClosers} stages={stages} pipelines={pipelines} canManagePipeline={canManagePipeline} onUpdated={onUpdated} dateLabel={dateLabel} />)}</tbody></table></div>
}

function CompactOpportunityRow({ opportunity, columns, stageLabel, assignableClosers, stages, pipelines, canManagePipeline, onUpdated, dateLabel }: { opportunity: OpportunityDto; columns: Array<{ key: PipelineSortBy; title: string }>; stageLabel: string; assignableClosers: OpportunityAssigneeDto[] | null; stages: PipelineStageDto[]; pipelines: PipelinesDto['pipelines']; canManagePipeline: boolean; onUpdated: () => void; dateLabel: (value: string | null) => string }) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const amountLabel = opportunity.amount && opportunity.currency ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency: opportunity.currency, maximumFractionDigits: 0 }).format(Number(opportunity.amount)) : null
  return <tr>
    <td data-label={columns[0].title}><details className="pipeline-compact-details" onToggle={(event) => setExpanded(event.currentTarget.open)}><summary><span>{opportunity.name}</span>{amountLabel && <small className="pipeline-compact-value">{amountLabel}</small>}</summary>{expanded && <div className="pipeline-compact-expanded"><OpportunityCard opportunity={opportunity} stages={stages} pipelines={pipelines} canManagePipeline={canManagePipeline} assignableClosers={assignableClosers} onUpdated={onUpdated} /></div>}</details></td>
    <td data-label={columns[1].title}>{opportunity.accountName}</td>
    <td data-label={columns[2].title}><span className="pipeline-compact-contact">{opportunity.contactName}</span><OpportunityContactLinks email={opportunity.contactEmail} phone={opportunity.contactPhone} emailLabel={t('pipeline.contactEmailLink', { email: opportunity.contactEmail })} phoneLabel={t('pipeline.contactPhoneLink', { phone: opportunity.contactPhone })} /></td>
    <td data-label={columns[3].title}><span className={opportunity.stage === 'won' ? 'pipeline-stage-pill won' : opportunity.stage === 'lost' ? 'pipeline-stage-pill lost' : 'pipeline-stage-pill'}>{stageLabel}</span></td>
    <td data-label={columns[4].title}>{opportunity.ownerName ?? t('pipeline.unassignedOwner')}</td>
    <td data-label={columns[5].title}><span className={opportunity.nextActionAt && new Date(opportunity.nextActionAt).getTime() < Date.now() ? 'pipeline-overdue-text' : ''}>{opportunity.nextAction ?? t('pipeline.actionMissing')}</span><small className="pipeline-compact-secondary">{dateLabel(opportunity.nextActionAt)}</small><small className="pipeline-compact-secondary">{opportunity.lastActivity ? `${t(`activityTypes.${opportunity.lastActivity.type}`)} · ${opportunity.lastActivity.subject} · ${new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(opportunity.lastActivity.occurredAt))}` : t('pipeline.noInteractions')}</small>{opportunity.lastActivity?.result && <small className="pipeline-compact-secondary">{t('pipeline.activityResult')}: {opportunity.lastActivity.result}</small>}</td>
  </tr>
}

function OpportunityContactLinks({ email, phone, emailLabel, phoneLabel }: { email: string | null; phone: string | null; emailLabel: string; phoneLabel: string }) {
  if (!email && !phone) return null
  const telephone = phone?.replace(/[^\d+]/g, '')
  return <span className="pipeline-contact-links">
    {email && <a href={`mailto:${email}`} aria-label={emailLabel}><Mail size={13} aria-hidden="true" /><span>{email}</span></a>}
    {telephone && phone && <a href={`tel:${telephone}`} aria-label={phoneLabel}><Phone size={13} aria-hidden="true" /><span>{phone}</span></a>}
  </span>
}

function PipelineColumn({ stage, title, count, opportunities, allStages, pipelines, canManagePipeline, assignableClosers, onUpdated, onDrop, onDropHandled, dropEvent }: { stage: PipelineStageDto; title: string; count: number; opportunities: OpportunityDto[]; allStages: PipelineStageDto[]; pipelines: PipelinesDto['pipelines']; canManagePipeline: boolean; assignableClosers: OpportunityAssigneeDto[] | null; onUpdated: () => void; onDrop: (opportunityId: string, stageKey: string) => void; onDropHandled: () => void; dropEvent: { opportunityId: string; stageKey: string } | null }) {
  const { t } = useTranslation()
  const [dragOver, setDragOver] = useState(false)
  return <section className={`pipeline-column${dragOver ? ' drag-over' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragOver(true) }} onDragLeave={(event) => { const target = event.relatedTarget; if (!(target instanceof Node && event.currentTarget.contains(target))) setDragOver(false) }} onDrop={(event) => { event.preventDefault(); setDragOver(false); const opportunityId = event.dataTransfer.getData('text/opportunity-id'); if (opportunityId) onDrop(opportunityId, stage.key) }}>
    <header><h3>{title}</h3><span>{count}</span></header>
    <div className="pipeline-column-cards">
      {opportunities.map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} stages={allStages} pipelines={pipelines} canManagePipeline={canManagePipeline} assignableClosers={assignableClosers} onUpdated={onUpdated} drop={dropEvent} onDropHandled={onDropHandled} />)}
      {count === 0 && <p className="pipeline-column-empty">{t('pipeline.noDeals')}</p>}
    </div>
  </section>
}

function OpportunityCard({ opportunity, stages: availableStages, pipelines, canManagePipeline, assignableClosers, onUpdated, drop, onDropHandled }: { opportunity: OpportunityDto; stages: PipelineStageDto[]; pipelines: PipelinesDto['pipelines']; canManagePipeline: boolean; assignableClosers: OpportunityAssigneeDto[] | null; onUpdated: () => void; drop?: { opportunityId: string; stageKey: string } | null; onDropHandled?: () => void }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [conversationContexts, setConversationContexts] = useState<OpportunityConversationContextDto[] | null>(null)
  const [contextsLoading, setContextsLoading] = useState(false)
  const [contextsError, setContextsError] = useState(false)
  const [editing, setEditing] = useState(false)
  const currentKey = opportunity.stage === 'custom' ? opportunity.pipelineStageKey ?? '' : opportunity.stage
  const [targetKey, setTargetKey] = useState(currentKey)
  const [targetPipelineId, setTargetPipelineId] = useState(opportunity.pipelineId)
  const [targetStages, setTargetStages] = useState(availableStages)
  const [transferLoading, setTransferLoading] = useState(false)
  const selectedStage = targetStages.find((item) => item.key === targetKey)
  const targetStage = selectedStage?.stage ?? opportunity.stage
  const [nextAction, setNextAction] = useState(opportunity.nextAction ?? '')
  const [nextActionAt, setNextActionAt] = useState(localDateTime(opportunity.nextActionAt ?? undefined))
  const [amount, setAmount] = useState<number | null>(opportunity.amount === null ? null : Number(opportunity.amount))
  const [currency, setCurrency] = useState(opportunity.currency ?? 'BRL')
  const [closedAt, setClosedAt] = useState(localDateTime())
  const [lossReason, setLossReason] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pendingDropKey, setPendingDropKey] = useState<string | null>(null)
  const [history, setHistory] = useState<OpportunityHistoryDto[] | null>(null)
  const [activities, setActivities] = useState<ActivityDto[] | null>(null)
  const [focusActivityForm, setFocusActivityForm] = useState(false)
  const activityFormRef = useRef<HTMLFormElement>(null)
  const [activityType, setActivityType] = useState<ActivityType>('call')
  const [activitySubject, setActivitySubject] = useState('')
  const [activityDetails, setActivityDetails] = useState('')
  const [activityResult, setActivityResult] = useState('')
  const [activityOccurredAt, setActivityOccurredAt] = useState(localDateTime())
  const [activitySaving, setActivitySaving] = useState(false)
  const [ownerSaving, setOwnerSaving] = useState(false)
  const allowedStages = targetPipelineId !== opportunity.pipelineId ? targetStages : targetStages.filter((item) => item.key === currentKey || opportunity.stage === 'custom' || item.stage === 'custom' || transitions[opportunity.stage].includes(item.stage))
  const canMove = !terminal(opportunity.stage) && (opportunity.stage === 'custom' || transitions[opportunity.stage].length > 0 || (canManagePipeline && pipelines.length > 1)) && opportunity.canUpdate
  const dueAt = opportunity.nextActionAt ? new Date(opportunity.nextActionAt) : null
  const overdue = Boolean(dueAt && dueAt.getTime() < Date.now() && !terminal(opportunity.stage))
  const stale = Date.now() - new Date(opportunity.stageChangedAt).getTime() > 7 * 86400000 && !terminal(opportunity.stage)
  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const loadConversationContexts = useCallback(async () => {
    setContextsLoading(true)
    setContextsError(false)
    try { setConversationContexts(await api.opportunities.conversationContexts(opportunity.id)) }
    catch { setContextsError(true) }
    finally { setContextsLoading(false) }
  }, [opportunity.id])
  useEffect(() => {
    if (open && conversationContexts === null && !contextsLoading && !contextsError) void loadConversationContexts()
  }, [open, conversationContexts, contextsLoading, contextsError, loadConversationContexts])
  const selectTargetPipeline = async (nextPipelineId: string) => {
    setTransferLoading(true); setTargetPipelineId(nextPipelineId); setTargetKey(''); setError('')
    try { const result = await api.opportunities.pipelineStages.list(nextPipelineId); const activeStages = result.stages.filter((stage) => stage.isActive); setTargetStages(activeStages); const firstOpen = activeStages.find((stage) => stage.stage !== 'won' && stage.stage !== 'lost'); if (firstOpen) setTargetKey(firstOpen.key) }
    catch { setError(t('errors.loadPipeline')) } finally { setTransferLoading(false) }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.opportunities.transition(opportunity.id, {
        expectedPipelineId: opportunity.pipelineId, pipelineId: targetPipelineId, expectedStage: opportunity.stage, expectedPipelineStageKey: opportunity.stage === 'custom' ? opportunity.pipelineStageKey ?? undefined : undefined, stage: targetStage, pipelineStageKey: targetStage === 'custom' ? selectedStage?.key : undefined, reason: reason.trim() || undefined,
        nextAction: terminal(targetStage) ? undefined : nextAction.trim(), nextActionAt: terminal(targetStage) ? undefined : new Date(nextActionAt).toISOString(),
        amount: targetStage === 'won' && amount !== null ? String(amount) : !terminal(targetStage) && amount !== null ? String(amount) : undefined, currency: targetStage === 'won' || (!terminal(targetStage) && amount !== null) ? currency : undefined,
        closedAt: targetStage === 'won' ? new Date(closedAt).toISOString() : undefined,
        lossReason: targetStage === 'lost' ? lossReason.trim() : undefined,
      })
      setEditing(false); onUpdated()
    } catch { setError(t('errors.updateOpportunity')) }
    finally { setSaving(false) }
  }
  const toggleTimeline = async () => {
    if (history !== null || activities !== null) { setHistory(null); setActivities(null); setFocusActivityForm(false); return }
    try {
      const [stageHistory, activityList] = await Promise.all([api.opportunities.history(opportunity.id), api.opportunities.activities.list(opportunity.id)])
      setHistory(stageHistory); setActivities(activityList); setError('')
    } catch { setError(t('errors.loadOpportunityHistory')) }
  }
  const openActivityForm = async () => {
    if (activities === null) { setFocusActivityForm(true); await toggleTimeline(); return }
    activityFormRef.current?.scrollIntoView({ block: 'center' })
    activityFormRef.current?.querySelector('input')?.focus()
  }
  useEffect(() => {
    if (!focusActivityForm || activities === null) return
    activityFormRef.current?.scrollIntoView({ block: 'center' })
    activityFormRef.current?.querySelector('input')?.focus()
    setFocusActivityForm(false)
  }, [activities, focusActivityForm])
  const submitActivity = async (event: React.FormEvent) => {
    event.preventDefault(); setActivitySaving(true); setError('')
    try {
      const activity = await api.opportunities.activities.create(opportunity.id, { type: activityType, subject: activitySubject.trim(), details: activityDetails.trim() || undefined, result: activityResult.trim() || undefined, occurredAt: new Date(activityOccurredAt).toISOString() })
      setActivities((current) => [activity, ...(current ?? [])]); setActivitySubject(''); setActivityDetails(''); setActivityResult(''); setActivityOccurredAt(localDateTime()); onUpdated()
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

  useEffect(() => {
    if (!drop || drop.opportunityId !== opportunity.id) return
    if (drop.stageKey === currentKey || !opportunity.canUpdate) { onDropHandled?.(); return }
    const nextStage = availableStages.find((item) => item.key === drop.stageKey)
    if (!nextStage || !(opportunity.stage === 'custom' || nextStage.stage === 'custom' || transitions[opportunity.stage].includes(nextStage.stage))) { onDropHandled?.(); return }
    setPendingDropKey(drop.stageKey); setTargetKey(drop.stageKey); setEditing(true); setOpen(true)
    onDropHandled?.()
  }, [availableStages, currentKey, drop, onDropHandled, opportunity.canUpdate, opportunity.id, opportunity.stage])

  const details = <article className={`opportunity-card opportunity-card-detail${overdue || !opportunity.nextActionAt ? ' at-risk' : ''}`}>
    <div className="opportunity-card-top"><strong>{opportunity.name}</strong>{stale && <span className="stale-flag">{t('pipeline.stale')}</span>}</div>
    <p className="opportunity-person">{opportunity.contactName} · {opportunity.ownerName ?? t('pipeline.unassignedOwner')}</p>
    {conversationContexts && conversationContexts.length > 0 && <section className="opportunity-conversation-context" aria-label={t('pipeline.conversationContext')}><h4>{t('pipeline.conversationContext')}</h4>{conversationContexts.map((context) => <article key={context.conversationId} className="opportunity-conversation-context-item"><small>{formatDate(context.capturedAt)}</small><p>{context.summary}</p>{context.confirmedFacts.length > 0 && <div><strong>{t('pipeline.confirmedFacts')}</strong><ul>{context.confirmedFacts.map((fact, index) => <li key={`${context.conversationId}-fact-${index}`}>{fact}</li>)}</ul></div>}{context.unknowns.length > 0 && <div><strong>{t('pipeline.openQuestions')}</strong><ul>{context.unknowns.map((unknown, index) => <li key={`${context.conversationId}-unknown-${index}`}>{unknown}</li>)}</ul></div>}</article>)}</section>}
    {contextsLoading && <WorkspaceState kind="loading" compact message={t('pipeline.contextLoading')} />}
    {contextsError && <WorkspaceState kind="error" compact message={t('pipeline.contextLoadFailed')}><Button onClick={() => void loadConversationContexts()}>{t('platform.retry')}</Button></WorkspaceState>}
    {!terminal(opportunity.stage) && assignableClosers && <label className="opportunity-owner-picker">{t('opportunityAssignment.assignCloser')}<SelectField aria-label={t('opportunityAssignment.assignCloserFor', { opportunity: opportunity.name })} value={opportunity.ownerUserId ?? ''} disabled={ownerSaving} onChange={(event) => void assignOwner(event.target.value)}><option value="">{t('pipeline.unassignedOwner')}</option>{assignableClosers.map((closer) => <option key={closer.id} value={closer.id}>{closer.name}</option>)}</SelectField></label>}
    <OpportunityContactLinks email={opportunity.contactEmail} phone={opportunity.contactPhone} emailLabel={t('pipeline.contactEmailLink', { email: opportunity.contactEmail })} phoneLabel={t('pipeline.contactPhoneLink', { phone: opportunity.contactPhone })} />
    <div className={`opportunity-next${overdue || !opportunity.nextActionAt ? ' overdue' : ''}`}>
      {opportunity.nextActionAt ? <><CalendarClock size={14} /><span><strong>{opportunity.nextAction ?? t('pipeline.actionMissing')}</strong><small>{formatDate(opportunity.nextActionAt)}</small></span></> : <><AlertTriangle size={14} /><span><strong>{t('pipeline.actionMissing')}</strong><small>{t('pipeline.addNextAction')}</small></span></>}
    </div>
    <div className="opportunity-last-activity"><History size={14} aria-hidden="true" /><span><strong>{t('pipeline.latestInteraction')}</strong>{opportunity.lastActivity ? <><small>{t(`activityTypes.${opportunity.lastActivity.type}`)} · {opportunity.lastActivity.subject}</small>{opportunity.lastActivity.result && <small>{t('pipeline.activityResult')}: {opportunity.lastActivity.result}</small>}<small>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(opportunity.lastActivity.occurredAt))}</small></> : <small>{t('pipeline.noInteractions')}</small>}</span></div>
    {opportunity.amount && <p className="opportunity-value">{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: opportunity.currency ?? 'BRL' }).format(Number(opportunity.amount))}</p>}
    {opportunity.lossReason && <p className="opportunity-loss">{t('pipeline.lossReason')}: {opportunity.lossReason}</p>}
      {canMove && <Button className="opportunity-edit" onClick={() => { setTargetKey(currentKey); setTargetPipelineId(opportunity.pipelineId); setTargetStages(availableStages); setEditing((value) => !value) }}><TrendingUp size={14} />{t('pipeline.advance')}</Button>}
    {opportunity.canUpdate && <Button className="opportunity-edit" onClick={() => void openActivityForm()}><MessageSquarePlus size={14} />{t('pipeline.logActivity')}</Button>}
    {editing && <form className="opportunity-transition" onSubmit={submit}>
      {canManagePipeline && pipelines.length > 1 && <label>{t('pipeline.selectPipeline')}<SelectField value={targetPipelineId} disabled={transferLoading} onChange={(event) => void selectTargetPipeline(event.target.value)}>{pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectField></label>}
      <label>{t('pipeline.nextStage')}<SelectField value={targetKey} onChange={(event) => setTargetKey(event.target.value)}>{!targetKey && <option value="">{t('pipeline.selectStage')}</option>}{allowedStages.map((stage) => <option key={stage.key} value={stage.key}>{stage.key === currentKey ? t('pipeline.keepStage') + ' · ' : ''}{stage.isSystem ? t(`opportunityStages.${stage.stage}`) : stage.name}</option>)}</SelectField></label>
      {targetStage === 'won' ? <div className="pipeline-conditional"><label>{t('pipeline.amount')}<CurrencyField currency={currency} min={0.01} value={amount} onValueChange={setAmount} required /></label><label>{t('pipeline.currency')}<TextField value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} required /></label><label>{t('pipeline.closedAt')}<CalendarField mode="datetime-local" value={closedAt} onValueChange={setClosedAt} required /></label></div> : targetStage === 'lost' ? <label>{t('pipeline.lossReason')}<TextareaField value={lossReason} onChange={(event) => setLossReason(event.target.value)} minLength={3} maxLength={1000} required /></label> : <><div className="pipeline-conditional"><label>{t('pipeline.nextAction')}<TextField value={nextAction} onChange={(event) => setNextAction(event.target.value)} minLength={3} maxLength={500} required /></label><label>{t('pipeline.nextActionAt')}<CalendarField mode="datetime-local" value={nextActionAt} onValueChange={setNextActionAt} required /></label></div><div className="pipeline-conditional"><label>{t('pipeline.estimatedAmount')}<CurrencyField currency={currency} min={0.01} value={amount} onValueChange={setAmount} /></label><label>{t('pipeline.currency')}<TextField value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} /></label></div></>}
      <label>{targetStage === opportunity.stage ? t('pipeline.updateReason') : t('pipeline.transitionNote')}<TextareaField value={reason} onChange={(event) => setReason(event.target.value)} minLength={targetStage === opportunity.stage ? 3 : undefined} maxLength={1000} required={targetStage === opportunity.stage} /></label>
      {targetPipelineId !== opportunity.pipelineId && targetStages.filter((stage) => stage.stage !== 'won' && stage.stage !== 'lost').length === 0 && <p className="pipeline-stage-required-hint">{t('pipelineStageSettings.addStageBeforeMove')}</p>}
      {error && <p className="error">{error}</p>}<Button className="primary" disabled={saving || transferLoading || !targetKey}>{saving ? t('common.saving') : t('pipeline.saveTransition')}<Save size={14} /></Button>
    </form>}
    <Button className="opportunity-history-toggle" onClick={() => void toggleTimeline()}><History size={13} />{activities === null ? t('pipeline.timeline') : t('pipeline.hideHistory')}</Button>
    {activities !== null && <div className="opportunity-timeline">
      {opportunity.canUpdate && <form ref={activityFormRef} className="activity-form" onSubmit={submitActivity}>
        <strong>{t('pipeline.logActivity')}</strong>
      <div className="activity-form-fields"><label>{t('pipeline.activityType')}<SelectField value={activityType} onChange={(event) => { if (isActivityType(event.target.value)) setActivityType(event.target.value) }}>{activityTypes.map((type) => <option key={type} value={type}>{t(`activityTypes.${type}`)}</option>)}</SelectField></label><label>{t('pipeline.activitySubject')}<TextField value={activitySubject} onChange={(event) => setActivitySubject(event.target.value)} minLength={2} maxLength={240} required /></label><label>{t('pipeline.occurredAt')}<CalendarField mode="datetime-local" value={activityOccurredAt} onValueChange={(value) => setActivityOccurredAt(value)} required /></label><label>{t('pipeline.activityResult')}<TextField value={activityResult} onChange={(event) => setActivityResult(event.target.value)} maxLength={1000} /></label><label className="activity-details-field">{t('pipeline.activityDetails')}<TextareaField value={activityDetails} onChange={(event) => setActivityDetails(event.target.value)} maxLength={5000} /></label></div>
        {error && <p className="error">{error}</p>}<Button className="primary" disabled={activitySaving}>{activitySaving ? t('common.saving') : t('pipeline.saveActivity')}</Button>
      </form>}
      {timeline.length === 0 ? <p className="activity-empty">{t('pipeline.noTimeline')}</p> : <ol className="opportunity-history">{timeline.map((item) => {
        const title = item.kind === 'stage' ? item.fromStage ? `${item.fromStage === 'custom' ? item.fromPipelineStageName ?? t('pipelineStageSettings.custom') : t(`opportunityStages.${item.fromStage}`)} → ${item.toStage === 'custom' ? item.toPipelineStageName ?? t('pipelineStageSettings.custom') : t(`opportunityStages.${item.toStage}`)}` : t('pipeline.opportunityCreated') : `${t(`activityTypes.${item.type}`)} · ${item.subject}`
        const details = item.kind === 'stage' ? item.reason : item.details
        return <li key={`${item.kind}-${item.id}`}><span>{title}</span><small>{item.actorName} · {formatDate(item.timestamp)}</small>{details && <p>{details}</p>}{item.kind === 'activity' && item.result && <p><strong>{t('pipeline.activityResult')}:</strong> {item.result}</p>}</li>
      })}</ol>}
    </div>}
  </article>
  const stageLabel = opportunity.stage === 'custom' ? availableStages.find((item) => item.key === opportunity.pipelineStageKey)?.name ?? t('pipelineStageSettings.custom') : t(`opportunityStages.${opportunity.stage}`)
  const amountLabel = opportunity.amount && opportunity.currency ? new Intl.NumberFormat(i18n.language, { style: 'currency', currency: opportunity.currency, maximumFractionDigits: 0 }).format(Number(opportunity.amount)) : null
  return <>
    <article className={`opportunity-card opportunity-card-compact${overdue || !opportunity.nextActionAt ? ' at-risk' : ''}`} draggable={opportunity.canUpdate && !terminal(opportunity.stage)} onDragStart={(event) => { event.dataTransfer.setData('text/opportunity-id', opportunity.id); event.dataTransfer.effectAllowed = 'move' }}>
      <button type="button" className="opportunity-card-open" onClick={() => setOpen(true)} aria-label={t('pipeline.openOpportunity', { name: opportunity.name })}>
        <span className="opportunity-card-top"><strong>{opportunity.name}</strong>{stale && <span className="stale-flag">{t('pipeline.stale')}</span>}</span>
        <span className="opportunity-card-compact-meta">{opportunity.accountName} · {opportunity.contactName}</span>
        <span className="opportunity-card-compact-footer"><span className="pipeline-stage-pill">{stageLabel}</span>{amountLabel && <strong className="opportunity-value">{amountLabel}</strong>}</span>
        <span className={`opportunity-card-compact-action${overdue || !opportunity.nextActionAt ? ' overdue' : ''}`}>{opportunity.nextActionAt ? `${opportunity.nextAction ?? t('pipeline.actionMissing')} · ${formatDate(opportunity.nextActionAt)}` : t('pipeline.actionMissing')}</span>
      </button>
    </article>
    <Modal open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) { setPendingDropKey(null); setEditing(false); setTargetKey(currentKey); setTargetPipelineId(opportunity.pipelineId); setTargetStages(availableStages) } }} title={opportunity.name} description={`${opportunity.accountName} · ${opportunity.contactName}`} closeLabel={t('common.close')} className="pipeline-opportunity-modal">
      {pendingDropKey && <p className="pipeline-drop-confirmation">{t('pipeline.dropConfirmation', { stage: availableStages.find((item) => item.key === pendingDropKey)?.name ?? t(`opportunityStages.${targetStage}`) })}</p>}
      {details}
    </Modal>
  </>
}
