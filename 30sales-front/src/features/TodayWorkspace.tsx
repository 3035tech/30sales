import { Button } from '../components/ui/FormControls'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, MessageCircle, RefreshCw, UserRoundCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api, type HandoffDto, type LeadDto, type OpportunityDto, type TaskDto } from '../lib/api'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import './TodayWorkspace.css'
import './TodayWorkspaceOverrides.css'

type Navigate = (page: 'inbox' | 'leads' | 'tasks' | 'handoffs' | 'pipeline') => void
type TodayData = { overdue: TaskDto[]; dueToday: TaskDto[]; handoffs: HandoffDto[]; responded: LeadDto[]; unassignedResponded: LeadDto[]; opportunities: OpportunityDto[] }
type TodayAvailability = { overdue: boolean; dueToday: boolean; handoffs: boolean; responded: boolean; unassignedResponded: boolean; opportunities: boolean }
const noTodayData: TodayData = { overdue: [], dueToday: [], handoffs: [], responded: [], unassignedResponded: [], opportunities: [] }
const noTodayAvailability: TodayAvailability = { overdue: false, dueToday: false, handoffs: false, responded: false, unassignedResponded: false, opportunities: false }
const startOfDay = (date: Date) => { const value = new Date(date); value.setHours(0, 0, 0, 0); return value }
const addDays = (date: Date, days: number) => { const value = new Date(date); value.setDate(value.getDate() + days); return value }
const isOpen = (opportunity: OpportunityDto) => opportunity.stage !== 'won' && opportunity.stage !== 'lost'

export function TodayWorkspace({ navigate, userId }: { navigate: Navigate; userId: string }) {
  const { t, i18n } = useTranslation()
  const [searchParams] = useSearchParams()
  const businessLineId = searchParams.get('businessLineId') ?? undefined
  const [data, setData] = useState<TodayData>(noTodayData)
  const [availability, setAvailability] = useState<TodayAvailability>(noTodayAvailability)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [partial, setPartial] = useState(false)
  const [failed, setFailed] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true); setPartial(false); setFailed(false)
    const today = startOfDay(new Date())
    const [overdueResult, dueTodayResult, handoffsResult, respondedResult, unassignedRespondedResult, opportunitiesResult] = await Promise.allSettled([
      api.tasks.list({ businessLineId, to: today.toISOString(), assignedToUserId: userId, status: 'open', limit: 100 }),
      api.tasks.list({ businessLineId, from: today.toISOString(), to: addDays(today, 1).toISOString(), assignedToUserId: userId, status: 'open', limit: 100 }),
      api.handoffs.list('requested', { businessLineId }),
      api.leads.list({ businessLineId, status: 'responded', assignedToUserId: userId, limit: 100 }),
      api.leads.list({ businessLineId, status: 'responded', assignedToUserId: 'unassigned', limit: 100 }),
      api.opportunities.list({ businessLineId, view: 'mine', limit: 100 }),
    ] as const)
    const value = <T,>(result: PromiseSettledResult<T>): T | null => result.status === 'fulfilled' ? result.value : null
    const overdue = value(overdueResult), dueToday = value(dueTodayResult), handoffs = value(handoffsResult), responded = value(respondedResult), unassignedResponded = value(unassignedRespondedResult), opportunities = value(opportunitiesResult)
    const nextAvailability: TodayAvailability = { overdue: overdue !== null, dueToday: dueToday !== null, handoffs: handoffs !== null, responded: responded !== null, unassignedResponded: unassignedResponded !== null, opportunities: opportunities !== null }
    const loaded = Object.values(nextAvailability).filter(Boolean).length
    setPartial(loaded > 0 && loaded < 6); setFailed(loaded === 0); setHasLoaded(true); setAvailability(loaded === 0 ? noTodayAvailability : nextAvailability)
    if (loaded > 0) setData((previous) => ({ overdue: overdue ?? previous.overdue, dueToday: dueToday ?? previous.dueToday, handoffs: handoffs ?? previous.handoffs, responded: responded ?? previous.responded, unassignedResponded: unassignedResponded ?? previous.unassignedResponded, opportunities: opportunities ?? previous.opportunities }))
    setLoading(false)
  }, [businessLineId, userId])

  useEffect(() => { void refresh() }, [refresh])
  const riskyDeals = data.opportunities.filter((item) => isOpen(item) && (!item.nextActionAt || new Date(item.nextActionAt).getTime() < Date.now() || Date.now() - new Date(item.stageChangedAt).getTime() > 7 * 86400000))
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const greeting = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
  const showMetric = (available: boolean, value: number) => loading && !hasLoaded || failed || !available ? '—' : value
  const metricDescription = (available: boolean, value: number) => loading && !hasLoaded || failed || !available ? t('today.metricsUnavailable') : t('today.taskCount', { count: value })

  return <section className="today-page">
    <header className="today-heading"><div><p className="eyebrow">{t('today.eyebrow')}</p><h2>{t('today.title')}</h2><p className="muted">{greeting} · {t('today.description')}</p></div><Button className="refresh" onClick={() => void refresh()} aria-label={t('today.refresh')}><RefreshCw size={16} /></Button></header>
    {failed && <WorkspaceState kind="error" compact message={t('today.loadFailed')} />}
    {partial && <WorkspaceState kind="partial" compact message={t('today.partial')} />}
    {loading && hasLoaded && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
    <div className="today-metrics">
      <Button onClick={() => navigate('tasks')} className="today-metric overdue"><span>{t('today.overdue')}</span><strong>{showMetric(availability.overdue, data.overdue.length)}</strong><small>{metricDescription(availability.overdue, data.overdue.length)}</small></Button>
      <Button onClick={() => navigate('tasks')} className="today-metric"><span>{t('today.dueToday')}</span><strong>{showMetric(availability.dueToday, data.dueToday.length)}</strong><small>{metricDescription(availability.dueToday, data.dueToday.length)}</small></Button>
      <Button onClick={() => navigate('handoffs')} className="today-metric"><span>{t('today.newHandoffs')}</span><strong>{showMetric(availability.handoffs, data.handoffs.length)}</strong><small>{availability.handoffs ? t('today.waitingCloser') : t('today.metricsUnavailable')}</small></Button>
      <Button onClick={() => navigate('leads')} className="today-metric"><span>{t('today.leadReplies')}</span><strong>{showMetric(availability.responded, data.responded.length)}</strong><small>{availability.responded ? t('today.awaitQualification') : t('today.metricsUnavailable')}</small></Button>
      <Button onClick={() => navigate('leads')} className="today-metric unassigned"><span>{t('leadAssignment.unassignedLeads')}</span><strong>{showMetric(availability.unassignedResponded, data.unassignedResponded.length)}</strong><small>{availability.unassignedResponded ? t('leadAssignment.distribute') : t('today.metricsUnavailable')}</small></Button>
      <Button onClick={() => navigate('pipeline')} className="today-metric"><span>{t('today.dealsAtRisk')}</span><strong>{showMetric(availability.opportunities, riskyDeals.length)}</strong><small>{availability.opportunities ? t('today.riskRule') : t('today.metricsUnavailable')}</small></Button>
    </div>
    <div className="today-columns">
      <section className="today-panel"><header><div><span className="today-icon red"><Clock3 size={16} /></span><h3>{t('today.attentionNow')}</h3></div><Button onClick={() => navigate('tasks')}>{t('today.openQueue')}<ArrowRight size={14} /></Button></header>
        {loading && !hasLoaded ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : failed ? <WorkspaceState kind="error" compact message={t('today.metricsUnavailable')} /> : (!availability.overdue || !availability.dueToday) && data.overdue.length + data.dueToday.length === 0 ? <WorkspaceState kind="partial" compact message={t('today.partial')} /> : data.overdue.length + data.dueToday.length === 0 ? <WorkspaceState kind="empty" compact message={t('today.nothingDue')} detail={t('today.nothingDueHint')} /> : <ul>{[...data.overdue.slice(0, 3).map((task) => ({ task, overdue: true })), ...data.dueToday.slice(0, 3).map((task) => ({ task, overdue: false }))].map(({ task, overdue }) => <li key={task.id} className={overdue ? 'is-overdue' : ''}><span className="today-list-icon"><CalendarClock size={15} /></span><div><strong>{task.title}</strong><span>{task.accountName} · {task.contactName}</span></div><time>{dateLabel(task.dueAt)}</time></li>)}</ul>}
      </section>
      <section className="today-panel"><header><div><span className="today-icon blue"><UserRoundCheck size={16} /></span><h3>{t('today.salesQueue')}</h3></div></header>
        {loading && !hasLoaded ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : failed ? <WorkspaceState kind="error" compact message={t('today.metricsUnavailable')} /> : (!availability.handoffs || !availability.responded || !availability.unassignedResponded || !availability.opportunities) && data.handoffs.length + data.responded.length + data.unassignedResponded.length + riskyDeals.length === 0 ? <WorkspaceState kind="partial" compact message={t('today.partial')} /> : <ul>
          {[...data.handoffs.slice(0, 2).map((item) => ({ key: `handoff-${item.id}`, title: item.accountName, subtitle: `${item.contactName} · ${t('today.handoffWaiting')}`, action: 'handoffs' as const })), ...data.unassignedResponded.slice(0, 2).map((item) => ({ key: `unassigned-${item.id}`, title: item.accountName, subtitle: `${item.contactName} · ${t('leadAssignment.unassignedLead')}`, action: 'leads' as const })), ...data.responded.slice(0, 2).map((item) => ({ key: `lead-${item.id}`, title: item.accountName, subtitle: `${item.contactName} · ${t('today.leadResponded')}`, action: 'leads' as const })), ...riskyDeals.slice(0, 2).map((item) => ({ key: `deal-${item.id}`, title: item.name, subtitle: `${item.accountName} · ${item.nextAction ?? t('today.missingNextAction')}`, action: 'pipeline' as const }))].slice(0, 6).map((item) => <li key={item.key}><span className="today-list-icon"><MessageCircle size={15} /></span><div><strong>{item.title}</strong><span>{item.subtitle}</span></div><Button aria-label={t('today.openItem')} onClick={() => navigate(item.action)}><ArrowRight size={15} /></Button></li>)}
          {data.handoffs.length + data.unassignedResponded.length + data.responded.length + riskyDeals.length === 0 && <li className="today-empty"><CheckCircle2 size={20} /><strong>{t('today.queueClear')}</strong><span>{t('today.queueClearHint')}</span></li>}
        </ul>}
      </section>
    </div>
    <p className="today-footnote">{availability.opportunities ? t('today.scopeNote', { count: data.opportunities.length }) : t('today.metricsUnavailable')}</p>
  </section>
}
