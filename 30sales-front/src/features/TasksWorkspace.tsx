import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarClock, Check, CircleAlert, Plus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api, type LeadDto, type TaskDto } from '../lib/api/client'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import './TasksWorkspace.css'

type TaskView = 'overdue' | 'today' | 'upcoming'
function dayStart(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
function addDays(date: Date, days: number) { const value = new Date(date); value.setDate(value.getDate() + days); return value }

export function TasksWorkspace() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const taskId = searchParams.get('taskId') ?? undefined
  const [view, setView] = useState<TaskView>(() => taskId ? 'overdue' : 'today')
  const [tasks, setTasks] = useState<TaskDto[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<'dueAt' | 'title' | 'accountName' | 'contactName'>('dueAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [hasNextPage, setHasNextPage] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [leads, setLeads] = useState<LeadDto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [completionSaving, setCompletionSaving] = useState(false)
  const [error, setError] = useState('')
  const [leadId, setLeadId] = useState('')
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [completionTaskId, setCompletionTaskId] = useState('')
  const [completionResult, setCompletionResult] = useState<'completed' | 'contacted' | 'no_response' | 'follow_up'>('completed')
  const [completionNote, setCompletionNote] = useState('')
  const [followUpTitle, setFollowUpTitle] = useState('')
  const [followUpDueAt, setFollowUpDueAt] = useState('')
  const requestRevision = useRef(0)

  const range = useMemo(() => {
    const today = dayStart(new Date())
    if (view === 'overdue') return { to: today.toISOString() }
    if (view === 'today') return { from: today.toISOString(), to: addDays(today, 1).toISOString() }
    return { from: addDays(today, 1).toISOString(), to: addDays(today, 8).toISOString() }
  }, [view])

  const refresh = useCallback(async () => {
    const revision = ++requestRevision.current
    setLoading(true); setError('')
    try {
      const page = await api.tasks.listPage({ ...(taskId ? { taskId } : { ...range, status: 'open' as const }), search: debouncedSearch || undefined, sortBy, sortDirection, limit: pageSize, offset })
      if (revision === requestRevision.current) { setTasks(page.data); setTotal(page.pagination.total); setHasNextPage(page.pagination.hasNextPage) }
    }
    catch { if (revision === requestRevision.current) setError(t('errors.loadTasks')) }
    finally { if (revision === requestRevision.current) setLoading(false) }
  }, [debouncedSearch, offset, pageSize, range, refreshTick, sortBy, sortDirection, t, taskId])
  useEffect(() => { if (taskId) setView('overdue') }, [taskId])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedSearch(search.trim()); setOffset(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [search])
  useEffect(() => { api.leads.list({ limit: 100 }).then(setLeads).catch(() => setLeads([])) }, [])

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.tasks.create(leadId, { title: title.trim(), dueAt: new Date(dueAt).toISOString() })
      setTitle(''); setDueAt(''); setOffset(0); setRefreshTick((tick) => tick + 1)
    } catch { setError(t('errors.saveTask')) }
    finally { setSaving(false) }
  }
  const complete = async (event: React.FormEvent, task: TaskDto) => {
    event.preventDefault(); setError(''); setCompletionSaving(true)
    try {
      await api.tasks.complete(task.id, { result: completionResult, resultNote: completionNote.trim() || undefined, followUp: completionResult === 'follow_up' ? { title: followUpTitle.trim(), dueAt: new Date(followUpDueAt).toISOString() } : undefined })
      setCompletionTaskId(''); setCompletionNote(''); setFollowUpTitle(''); setFollowUpDueAt(''); setCompletionResult('completed'); if (!taskId) setOffset(0); setRefreshTick((tick) => tick + 1)
    }
    catch { setError(t('errors.completeTask')) }
    finally { setCompletionSaving(false) }
  }
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  return <section className="leads-page tasks-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('tasks.eyebrow')}</p><h2>{t('tasks.title')}</h2><p className="muted">{t('tasks.description')}</p></div>
      <button className="refresh" onClick={() => void refresh()} aria-label={t('tasks.refresh')}><RefreshCw size={16} /></button>
    </header>
    <div className="task-views" role="tablist" aria-label={t('tasks.views')}>
      {(['overdue', 'today', 'upcoming'] as const).map((item) => <button key={item} role="tab" aria-selected={view === item} className={view === item ? 'selected' : ''} onClick={() => { setView(item); setOffset(0); if (taskId) { const next = new URLSearchParams(searchParams); next.delete('taskId'); setSearchParams(next, { replace: true }) } }}>{t(`tasks.${item}`)}</button>)}
    </div>
    <form className="task-form" onSubmit={createTask}>
      <div className="lead-form-title"><Plus size={18} /><div><strong>{t('tasks.newTask')}</strong><small>{t('tasks.newTaskHint')}</small></div></div>
      <div className="task-fields">
        <label>{t('tasks.lead')}<select value={leadId} onChange={(event) => setLeadId(event.target.value)} required><option value="">{t('tasks.chooseLead')}</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.accountName} — {lead.contactName}</option>)}</select></label>
        <label>{t('tasks.action')}<input value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={240} placeholder={t('tasks.actionPlaceholder')} required /></label>
        <label>{t('tasks.dueAt')}<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required /></label>
        <button className="primary" disabled={saving || !leads.length}>{saving ? t('common.saving') : t('tasks.addTask')}</button>
      </div>
    </form>
    {error && tasks.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    <div className="lead-list-panel task-list">
      <div className="lead-list-toolbar"><div><h3>{t(`tasks.${view}`)}</h3><p>{taskId ? t('tasks.selectedTask') : t('tasks.count', { count: total })}</p></div><CalendarClock size={18} /></div>
      <div className="task-list-controls"><label>{t('tasks.search')}<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} placeholder={t('tasks.searchHint')} /></label><label>{t('tasks.sortBy')}<select value={sortBy} onChange={(event) => { setSortBy(event.target.value as typeof sortBy); setOffset(0) }}><option value="dueAt">{t('tasks.sort.dueAt')}</option><option value="title">{t('tasks.sort.title')}</option><option value="accountName">{t('tasks.sort.accountName')}</option><option value="contactName">{t('tasks.sort.contactName')}</option></select></label><button className="task-sort-direction" type="button" aria-label={t(sortDirection === 'asc' ? 'tasks.sortDescending' : 'tasks.sortAscending')} onClick={() => { setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc'); setOffset(0) }}>{sortDirection === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}{t(sortDirection === 'asc' ? 'tasks.ascending' : 'tasks.descending')}</button></div>
      {loading && tasks.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
      {loading && tasks.length === 0 ? <WorkspaceState kind="loading" message={t('common.loading')} /> : tasks.length === 0 ? error ? <WorkspaceState kind="error" message={error} /> : <WorkspaceState kind="empty" message={debouncedSearch ? t('tasks.noSearchResults') : t(`tasks.empty.${view}`)} detail={debouncedSearch ? t('tasks.noSearchResultsHint') : t('tasks.emptyHint')} /> : <ul className="task-items">{tasks.map((task) => <li key={task.id} className={view === 'overdue' && task.status === 'open' ? 'overdue' : ''}>
        <div className="task-time">{view === 'overdue' && task.status === 'open' && <CircleAlert size={15} />}{dateLabel(task.dueAt)}</div><div className="task-copy"><strong>{task.title}</strong><span>{task.accountName} · {task.contactName}</span></div>
        {task.status !== 'open' ? <span className={`task-status-label is-${task.status}`}>{t(`tasks.status.${task.status}`)}</span> : completionTaskId !== task.id && <button className="task-complete" onClick={() => { setCompletionTaskId(task.id); setCompletionResult('completed'); setCompletionNote('') }} aria-label={t('tasks.completeFor', { title: task.title })}><Check size={17} />{t('tasks.complete')}</button>}
        {completionTaskId === task.id && <form className="task-completion-form" onSubmit={(event) => void complete(event, task)}>
          <label>{t('taskCompletion.result')}<select value={completionResult} onChange={(event) => setCompletionResult(event.target.value as typeof completionResult)}><option value="completed">{t('taskCompletion.results.completed')}</option><option value="contacted">{t('taskCompletion.results.contacted')}</option><option value="no_response">{t('taskCompletion.results.no_response')}</option><option value="follow_up">{t('taskCompletion.results.follow_up')}</option></select></label>
          <label>{t('taskCompletion.resultNote')}<textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} maxLength={2000} /></label>
          {completionResult === 'follow_up' && <div className="task-follow-up"><label>{t('taskCompletion.followUpTitle')}<input value={followUpTitle} onChange={(event) => setFollowUpTitle(event.target.value)} minLength={2} maxLength={240} required /></label><label>{t('taskCompletion.followUpDueAt')}<input type="datetime-local" value={followUpDueAt} onChange={(event) => setFollowUpDueAt(event.target.value)} required /></label></div>}
          <div className="task-completion-actions"><button type="button" onClick={() => setCompletionTaskId('')}>{t('common.cancel')}</button><button className="primary" disabled={completionSaving}>{completionSaving ? t('common.saving') : t('taskCompletion.saveResult')}</button></div>
        </form>}
      </li>)}</ul>}
      <footer className="task-pagination"><span>{t('table.range', { from: total ? offset + 1 : 0, to: Math.min(offset + pageSize, total), total })}</span><label>{t('table.rowsPerPage')}<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><div><button type="button" onClick={() => setOffset(Math.max(0, offset - pageSize))} disabled={loading || offset === 0}>{t('table.previous')}</button><button type="button" onClick={() => setOffset(offset + pageSize)} disabled={loading || !hasNextPage}>{t('table.next')}</button></div></footer>
    </div>
  </section>
}
