import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, Clock3, MessageCircle, RefreshCw, UserRoundCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type HandoffDto, type LeadDto, type OpportunityDto, type TaskDto } from '../lib/api/client'
import './TodayWorkspace.css'
import './TodayWorkspaceOverrides.css'

type Navigate = (page: 'inbox' | 'leads' | 'tasks' | 'handoffs' | 'pipeline') => void
type TodayData = { overdue: TaskDto[]; dueToday: TaskDto[]; handoffs: HandoffDto[]; responded: LeadDto[]; unassignedResponded: LeadDto[]; opportunities: OpportunityDto[] }
const startOfDay = (date: Date) => { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
const addDays = (date: Date, days: number) => { const value = new Date(date); value.setDate(value.getDate() + days); return value }
const isOpen = (opportunity: OpportunityDto) => opportunity.stage !== 'won' && opportunity.stage !== 'lost'

export function TodayWorkspace({ navigate, userId }: { navigate: Navigate; userId: string }) {
  const { t, i18n } = useTranslation()
  const [data, setData] = useState<TodayData>({ overdue: [], dueToday: [], handoffs: [], responded: [], unassignedResponded: [], opportunities: [] })
  const [loading, setLoading] = useState(true)
  const [partial, setPartial] = useState(false)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setPartial(false); setFailed(false)
    const today = startOfDay(new Date())
    const results = await Promise.allSettled([
      api.tasks.list({ to: today.toISOString(), assignedToUserId: userId, status: 'open', limit: 100 }),
      api.tasks.list({ from: today.toISOString(), to: addDays(today, 1).toISOString(), assignedToUserId: userId, status: 'open', limit: 100 }),
      api.handoffs.list('requested'),
      api.leads.list({ status: 'responded', assignedToUserId: userId, limit: 100 }),
      api.leads.list({ status: 'responded', assignedToUserId: 'unassigned', limit: 100 }),
      api.opportunities.list({ view: 'mine', limit: 100 }),
    ] as const)
    const value = <T,>(index: number): T | null => results[index].status === 'fulfilled' ? results[index].value as T : null
    const overdue = value<TaskDto[]>(0), dueToday = value<TaskDto[]>(1), handoffs = value<HandoffDto[]>(2), responded = value<LeadDto[]>(3), unassignedResponded = value<LeadDto[]>(4), opportunities = value<OpportunityDto[]>(5)
    const loaded = [overdue, dueToday, handoffs, responded, unassignedResponded, opportunities].filter((item) => item !== null).length
    setPartial(loaded > 0 && loaded < 6); setFailed(loaded === 0)
    setData({ overdue: overdue ?? [], dueToday: dueToday ?? [], handoffs: handoffs ?? [], responded: responded ?? [], unassignedResponded: unassignedResponded ?? [], opportunities: opportunities ?? [] })
    setLoading(false)
  }, [userId])

  useEffect(() => { void refresh() }, [refresh])
  const riskyDeals = data.opportunities.filter((item) => isOpen(item) && (!item.nextActionAt || new Date(item.nextActionAt).getTime() < Date.now() || Date.now() - new Date(item.stageChangedAt).getTime() > 7 * 86400000))
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const greeting = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  return <section className="today-page">
    <header className="today-heading"><div><p className="eyebrow">{t('today.eyebrow')}</p><h2>{t('today.title')}</h2><p className="muted">{greeting} · {t('today.description')}</p></div><button className="refresh" onClick={() => void refresh()} aria-label={t('today.refresh')}><RefreshCw size={16} /></button></header>
    {failed && <div className="today-alert error"><AlertCircle size={16} />{t('today.loadFailed')}</div>}
    {partial && <div className="today-alert"><AlertCircle size={16} />{t('today.partial')}</div>}
    <div className="today-metrics">
      <button onClick={() => navigate('tasks')} className="today-metric overdue"><span>{t('today.overdue')}</span><strong>{loading ? '—' : data.overdue.length}</strong><small>{t('today.taskCount', { count: data.overdue.length })}</small></button>
      <button onClick={() => navigate('tasks')} className="today-metric"><span>{t('today.dueToday')}</span><strong>{loading ? '—' : data.dueToday.length}</strong><small>{t('today.taskCount', { count: data.dueToday.length })}</small></button>
      <button onClick={() => navigate('handoffs')} className="today-metric"><span>{t('today.newHandoffs')}</span><strong>{loading ? '—' : data.handoffs.length}</strong><small>{t('today.waitingCloser')}</small></button>
      <button onClick={() => navigate('leads')} className="today-metric"><span>{t('today.leadReplies')}</span><strong>{loading ? '—' : data.responded.length}</strong><small>{t('today.awaitQualification')}</small></button>
      <button onClick={() => navigate('leads')} className="today-metric unassigned"><span>{t('leadAssignment.unassignedLeads')}</span><strong>{loading ? '—' : data.unassignedResponded.length}</strong><small>{t('leadAssignment.distribute')}</small></button>
      <button onClick={() => navigate('pipeline')} className="today-metric"><span>{t('today.dealsAtRisk')}</span><strong>{loading ? '—' : riskyDeals.length}</strong><small>{t('today.riskRule')}</small></button>
    </div>
    <div className="today-columns">
      <section className="today-panel"><header><div><span className="today-icon red"><Clock3 size={16} /></span><h3>{t('today.attentionNow')}</h3></div><button onClick={() => navigate('tasks')}>{t('today.openQueue')}<ArrowRight size={14} /></button></header>
        {loading ? <p className="today-empty">{t('common.loading')}</p> : data.overdue.length + data.dueToday.length === 0 ? <div className="today-empty"><CheckCircle2 size={20} /><strong>{t('today.nothingDue')}</strong><span>{t('today.nothingDueHint')}</span></div> : <ul>{[...data.overdue.slice(0, 3).map((task) => ({ task, overdue: true })), ...data.dueToday.slice(0, 3).map((task) => ({ task, overdue: false }))].map(({ task, overdue }) => <li key={task.id} className={overdue ? 'is-overdue' : ''}><span className="today-list-icon"><CalendarClock size={15} /></span><div><strong>{task.title}</strong><span>{task.accountName} · {task.contactName}</span></div><time>{dateLabel(task.dueAt)}</time></li>)}</ul>}
      </section>
      <section className="today-panel"><header><div><span className="today-icon blue"><UserRoundCheck size={16} /></span><h3>{t('today.salesQueue')}</h3></div></header>
        {loading ? <p className="today-empty">{t('common.loading')}</p> : <ul>
          {[...data.handoffs.slice(0, 2).map((item) => ({ key: `handoff-${item.id}`, title: item.accountName, subtitle: `${item.contactName} · ${t('today.handoffWaiting')}`, action: 'handoffs' as const })), ...data.unassignedResponded.slice(0, 2).map((item) => ({ key: `unassigned-${item.id}`, title: item.accountName, subtitle: `${item.contactName} · ${t('leadAssignment.unassignedLead')}`, action: 'leads' as const })), ...data.responded.slice(0, 2).map((item) => ({ key: `lead-${item.id}`, title: item.accountName, subtitle: `${item.contactName} · ${t('today.leadResponded')}`, action: 'leads' as const })), ...riskyDeals.slice(0, 2).map((item) => ({ key: `deal-${item.id}`, title: item.name, subtitle: `${item.accountName} · ${item.nextAction ?? t('today.missingNextAction')}`, action: 'pipeline' as const }))].slice(0, 6).map((item) => <li key={item.key}><span className="today-list-icon"><MessageCircle size={15} /></span><div><strong>{item.title}</strong><span>{item.subtitle}</span></div><button aria-label={t('today.openItem')} onClick={() => navigate(item.action)}><ArrowRight size={15} /></button></li>)}
          {data.handoffs.length + data.unassignedResponded.length + data.responded.length + riskyDeals.length === 0 && <li className="today-empty"><CheckCircle2 size={20} /><strong>{t('today.queueClear')}</strong><span>{t('today.queueClearHint')}</span></li>}
        </ul>}
      </section>
    </div>
    <p className="today-footnote">{t('today.scopeNote', { count: data.opportunities.length })}</p>
  </section>
}
