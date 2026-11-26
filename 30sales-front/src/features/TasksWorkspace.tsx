import { Button, CalendarField, IconButton, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarClock, Check, ChevronLeft, ChevronRight, CircleAlert, Plus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api, type LeadDto, type TaskDto } from '../lib/api'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import { notifySystemAlert, SYSTEM_ALERT_KIND } from '../components/ui/SystemAlert'
import './TasksWorkspace.css'

type TaskView = 'overdue' | 'today' | 'upcoming'
function dayStart(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
function addDays(date: Date, days: number) { const value = new Date(date); value.setDate(value.getDate() + days); return value }

export function TasksWorkspace() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const taskId = searchParams.get('taskId') ?? undefined
  const businessLineId = searchParams.get('businessLineId') ?? undefined
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
  const [leadsState, setLeadsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [createTaskOpen, setCreateTaskOpen] = useState(false)
  const [completionSaving, setCompletionSaving] = useState(false)
  const [error, setError] = useState('')
  const [leadId, setLeadId] = useState('')
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [completionTaskId, setCompletionTaskId] = useState('')
  const [completionResult, setCompletionResult] = useState<'completed' | 'contacted' | 'no_response' | 'follow_up'>('completed')
  const [completionNote, setCompletionNote] = useState('')
  const completionSelectRef = useRef<HTMLButtonElement>(null)
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
      const page = await api.tasks.listPage({ ...(taskId ? { taskId } : { ...range, status: 'open' as const }), businessLineId, search: debouncedSearch || undefined, sortBy, sortDirection, limit: pageSize, offset })
      if (revision === requestRevision.current) { setTasks(page.data); setTotal(page.pagination.total); setHasNextPage(page.pagination.hasNextPage) }
    }
    catch { if (revision === requestRevision.current) setError(t('errors.loadTasks')) }
    finally { if (revision === requestRevision.current) setLoading(false) }
  }, [businessLineId, debouncedSearch, offset, pageSize, range, refreshTick, sortBy, sortDirection, t, taskId])
  useEffect(() => { if (taskId) setView('overdue') }, [taskId])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedSearch(search.trim()); setOffset(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [search])
  useEffect(() => {
    let active = true
    setLeadsState('loading')
    api.leads.list({ businessLineId, limit: 100 })
      .then((result) => { if (active) { setLeads(result); setLeadsState('ready') } })
      .catch(() => { if (active) setLeadsState('error') })
    return () => { active = false }
  }, [businessLineId])
  useEffect(() => { if (completionTaskId) completionSelectRef.current?.focus() }, [completionTaskId])

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault()
    const dueAtDate = new Date(dueAt)
    if (isNaN(dueAtDate.getTime())) return
    setSaving(true); setError('')
    try {
      await api.tasks.create(leadId, { title: title.trim(), dueAt: dueAtDate.toISOString() })
      setTitle(''); setDueAt(''); setCreateTaskOpen(false); setOffset(0); setRefreshTick((tick) => tick + 1)
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('tasks.created'))
    } catch { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('errors.saveTask')) }
    finally { setSaving(false) }
  }
  const complete = async (event: React.FormEvent, task: TaskDto) => {
    event.preventDefault(); setError('')
    if (completionResult === 'follow_up') { const d = new Date(followUpDueAt); if (isNaN(d.getTime())) return }
    setCompletionSaving(true)
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
      <div className="task-header-actions"><Button className="primary" onClick={() => setCreateTaskOpen(true)}><Plus size={16} />{t('tasks.newTask')}</Button><Button className="refresh" onClick={() => void refresh()} aria-label={t('tasks.refresh')}><RefreshCw size={16} /></Button></div>
    </header>
    <div className="task-views" role="tablist" aria-label={t('tasks.views')}>
      {(['overdue', 'today', 'upcoming'] as const).map((item) => <Button key={item} role="tab" aria-selected={view === item} className={view === item ? 'selected' : ''} onClick={() => { setView(item); setOffset(0); if (taskId) { const next = new URLSearchParams(searchParams); next.delete('taskId'); setSearchParams(next, { replace: true }) } }}>{t(`tasks.${item}`)}</Button>)}
    </div>
    <Modal open={createTaskOpen} onOpenChange={setCreateTaskOpen} title={t('tasks.newTask')} description={t('tasks.newTaskHint')} closeLabel={t('common.close')} className="task-create-modal">
    <form className="task-form" onSubmit={createTask}>
      <div className="task-fields">
        <label>{t('tasks.lead')}<SelectField value={leadId} onChange={(event) => setLeadId(event.target.value)} required disabled={leadsState !== 'ready'}><option value="">{t('tasks.chooseLead')}</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.accountName}{lead.contactName ? ` — ${lead.contactName}` : ''}</option>)}</SelectField>{leadsState === 'loading' && <small aria-live="polite">{t('common.loading')}</small>}{leadsState === 'error' && <small className="ui-field-error" role="alert">{t('errors.loadLeads')}</small>}{leadsState === 'ready' && leads.length === 0 && <small>{t('tasks.noLeads')}</small>}</label>
        <label>{t('tasks.action')}<TextField value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={240} placeholder={t('tasks.actionPlaceholder')} required /></label>
        <label>{t('tasks.dueAt')}<CalendarField mode="datetime-local" value={dueAt} onValueChange={(value) => setDueAt(value)} required /></label>
        <Button className="primary" disabled={saving || leadsState !== 'ready' || !leads.length}>{saving ? t('common.saving') : t('tasks.addTask')}</Button>
      </div>
    </form>
    </Modal>
    {error && tasks.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    <div className="lead-list-panel task-list" role="tabpanel" aria-label={t(`tasks.${view}`)}>
      <div className="lead-list-toolbar"><div><h3>{t(`tasks.${view}`)}</h3><p>{taskId ? t('tasks.selectedTask') : t('tasks.count', { count: total })}</p></div><CalendarClock size={18} /></div>
      <div className="task-list-controls"><label>{t('tasks.search')}<TextField type="search" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} placeholder={t('tasks.searchHint')} /></label><label>{t('tasks.sortBy')}<SelectField value={sortBy} onChange={(event) => { setSortBy(event.target.value as typeof sortBy); setOffset(0) }}><option value="dueAt">{t('tasks.sort.dueAt')}</option><option value="title">{t('tasks.sort.title')}</option><option value="accountName">{t('tasks.sort.accountName')}</option><option value="contactName">{t('tasks.sort.contactName')}</option></SelectField></label><IconButton className="task-sort-direction" label={t(sortDirection === 'asc' ? 'tasks.sortDescending' : 'tasks.sortAscending')} onClick={() => { setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc'); setOffset(0) }}>{sortDirection === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}</IconButton></div>
      {loading && tasks.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
      {loading && tasks.length === 0 ? <WorkspaceState kind="loading" message={t('common.loading')} /> : tasks.length === 0 ? error ? <WorkspaceState kind="error" message={error} /> : <WorkspaceState kind="empty" message={debouncedSearch ? t('tasks.noSearchResults') : t(`tasks.empty.${view}`)} detail={debouncedSearch ? t('tasks.noSearchResultsHint') : t('tasks.emptyHint')} /> : <ul className="task-items">{tasks.map((task) => <li key={task.id} className={view === 'overdue' && task.status === 'open' ? 'overdue' : ''}>
        <div className="task-time">{view === 'overdue' && task.status === 'open' && <CircleAlert size={15} />}{dateLabel(task.dueAt)}</div><div className="task-copy"><strong>{task.title}</strong><span>{task.accountName} · {task.contactName}</span></div>
        {task.status !== 'open' ? <span className={`task-status-label is-${task.status}`}>{t(`tasks.status.${task.status}`)}</span> : completionTaskId !== task.id && <IconButton className="task-complete" label={t('tasks.completeFor', { title: task.title })} onClick={() => { setCompletionTaskId(task.id); setCompletionResult('completed'); setCompletionNote('') }}><Check size={17} /></IconButton>}
        {completionTaskId === task.id && <form className="task-completion-form" onSubmit={(event) => void complete(event, task)}>
          <label>{t('taskCompletion.result')}<SelectField ref={completionSelectRef} value={completionResult} onChange={(event) => setCompletionResult(event.target.value as typeof completionResult)}><option value="completed">{t('taskCompletion.results.completed')}</option><option value="contacted">{t('taskCompletion.results.contacted')}</option><option value="no_response">{t('taskCompletion.results.no_response')}</option><option value="follow_up">{t('taskCompletion.results.follow_up')}</option></SelectField></label>
          <label>{t('taskCompletion.resultNote')}<TextareaField value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} maxLength={2000} /></label>
          {completionResult === 'follow_up' && <div className="task-follow-up"><label>{t('taskCompletion.followUpTitle')}<TextField value={followUpTitle} onChange={(event) => setFollowUpTitle(event.target.value)} minLength={2} maxLength={240} required /></label><label>{t('taskCompletion.followUpDueAt')}<CalendarField mode="datetime-local" value={followUpDueAt} onValueChange={(value) => setFollowUpDueAt(value)} required /></label></div>}
          <div className="task-completion-actions"><Button type="button" onClick={() => setCompletionTaskId('')}>{t('common.cancel')}</Button><Button className="primary" disabled={completionSaving}>{completionSaving ? t('common.saving') : t('taskCompletion.saveResult')}</Button></div>
        </form>}
      </li>)}</ul>}
      <footer className="task-pagination"><span>{t('table.range', { from: total ? offset + 1 : 0, to: Math.min(offset + pageSize, total), total })}</span><label>{t('table.rowsPerPage')}<SelectField value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></SelectField></label><div><Button type="button" aria-label={t('table.previous')} onClick={() => setOffset(Math.max(0, offset - pageSize))} disabled={loading || offset === 0}><ChevronLeft size={16} aria-hidden="true" /></Button><Button type="button" aria-label={t('table.next')} onClick={() => setOffset(offset + pageSize)} disabled={loading || !hasNextPage}><ChevronRight size={16} aria-hidden="true" /></Button></div></footer>
    </div>
  </section>
}
