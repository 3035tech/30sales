import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, CircleAlert, ListTodo, Plus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type LeadDto, type TaskDto } from '../lib/api/client'
import './TasksWorkspace.css'

type TaskView = 'overdue' | 'today' | 'upcoming'
function dayStart(date: Date) { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
function addDays(date: Date, days: number) { const value = new Date(date); value.setDate(value.getDate() + days); return value }

export function TasksWorkspace() {
  const { t, i18n } = useTranslation()
  const [view, setView] = useState<TaskView>('today')
  const [tasks, setTasks] = useState<TaskDto[]>([])
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

  const range = useMemo(() => {
    const today = dayStart(new Date())
    if (view === 'overdue') return { to: today.toISOString() }
    if (view === 'today') return { from: today.toISOString(), to: addDays(today, 1).toISOString() }
    return { from: addDays(today, 1).toISOString(), to: addDays(today, 8).toISOString() }
  }, [view])

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { setTasks(await api.tasks.list({ ...range, status: 'open' })) }
    catch { setError(t('errors.loadTasks')) }
    finally { setLoading(false) }
  }, [range, t])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { api.leads.list({ limit: 100 }).then(setLeads).catch(() => setLeads([])) }, [])

  const createTask = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.tasks.create(leadId, { title: title.trim(), dueAt: new Date(dueAt).toISOString() })
      setTitle(''); setDueAt(''); await refresh()
    } catch { setError(t('errors.saveTask')) }
    finally { setSaving(false) }
  }
  const complete = async (event: React.FormEvent, task: TaskDto) => {
    event.preventDefault(); setError(''); setCompletionSaving(true)
    try {
      await api.tasks.complete(task.id, { result: completionResult, resultNote: completionNote.trim() || undefined, followUp: completionResult === 'follow_up' ? { title: followUpTitle.trim(), dueAt: new Date(followUpDueAt).toISOString() } : undefined })
      setCompletionTaskId(''); setCompletionNote(''); setFollowUpTitle(''); setFollowUpDueAt(''); setCompletionResult('completed'); await refresh()
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
      {(['overdue', 'today', 'upcoming'] as const).map((item) => <button key={item} role="tab" aria-selected={view === item} className={view === item ? 'selected' : ''} onClick={() => setView(item)}>{t(`tasks.${item}`)}</button>)}
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
    {error && <p className="error lead-error">{error}</p>}
    <div className="lead-list-panel task-list">
      <div className="lead-list-toolbar"><div><h3>{t(`tasks.${view}`)}</h3><p>{t('tasks.count', { count: tasks.length })}</p></div><CalendarClock size={18} /></div>
      {loading ? <div className="lead-empty">{t('common.loading')}</div> : tasks.length === 0 ? <div className="lead-empty"><span className="card-icon"><ListTodo size={19} /></span><h3>{t(`tasks.empty.${view}`)}</h3><p>{t('tasks.emptyHint')}</p></div> : <ul className="task-items">{tasks.map((task) => <li key={task.id} className={view === 'overdue' ? 'overdue' : ''}>
        <div className="task-time">{view === 'overdue' && <CircleAlert size={15} />}{dateLabel(task.dueAt)}</div><div className="task-copy"><strong>{task.title}</strong><span>{task.accountName} · {task.contactName}</span></div>
        {completionTaskId !== task.id && <button className="task-complete" onClick={() => { setCompletionTaskId(task.id); setCompletionResult('completed'); setCompletionNote('') }} aria-label={t('tasks.completeFor', { title: task.title })}><Check size={17} />{t('tasks.complete')}</button>}
        {completionTaskId === task.id && <form className="task-completion-form" onSubmit={(event) => void complete(event, task)}>
          <label>{t('taskCompletion.result')}<select value={completionResult} onChange={(event) => setCompletionResult(event.target.value as typeof completionResult)}><option value="completed">{t('taskCompletion.results.completed')}</option><option value="contacted">{t('taskCompletion.results.contacted')}</option><option value="no_response">{t('taskCompletion.results.no_response')}</option><option value="follow_up">{t('taskCompletion.results.follow_up')}</option></select></label>
          <label>{t('taskCompletion.resultNote')}<textarea value={completionNote} onChange={(event) => setCompletionNote(event.target.value)} maxLength={2000} /></label>
          {completionResult === 'follow_up' && <div className="task-follow-up"><label>{t('taskCompletion.followUpTitle')}<input value={followUpTitle} onChange={(event) => setFollowUpTitle(event.target.value)} minLength={2} maxLength={240} required /></label><label>{t('taskCompletion.followUpDueAt')}<input type="datetime-local" value={followUpDueAt} onChange={(event) => setFollowUpDueAt(event.target.value)} required /></label></div>}
          <div className="task-completion-actions"><button type="button" onClick={() => setCompletionTaskId('')}>{t('common.cancel')}</button><button className="primary" disabled={completionSaving}>{completionSaving ? t('common.saving') : t('taskCompletion.saveResult')}</button></div>
        </form>}
      </li>)}</ul>}
    </div>
  </section>
}
