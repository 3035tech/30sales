import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type FunnelReportDto, type LeadStatus } from '../lib/api/client'
import './FunnelReportWorkspace.css'
import './HandoffReport.css'
import './LeadFunnelReport.css'

const leadStatuses: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']
function dateInput(date: Date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10) }
function durationLabel(minutes: number, locale: string) {
  const totalMinutes = Math.max(0, Math.round(minutes))
  const hours = Math.floor(totalMinutes / 60)
  const remainder = totalMinutes % 60
  const format = (value: number, unit: 'hour' | 'minute') => new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value)
  return hours ? `${format(hours, 'hour')}${remainder ? ` ${format(remainder, 'minute')}` : ''}` : format(remainder, 'minute')
}

export function FunnelReportWorkspace() {
  const { t, i18n } = useTranslation()
  const today = dateInput(new Date())
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 29)
  const [from, setFrom] = useState(dateInput(monthAgo))
  const [to, setTo] = useState(today)
  const [report, setReport] = useState<FunnelReportDto | null>(null)
  const [pipelineStages, setPipelineStages] = useState<Awaited<ReturnType<typeof api.opportunities.pipelineStages.list>>['stages']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true); setError('')
    try { const [nextReport, stageSettings] = await Promise.all([api.reports.funnel(from, to), api.opportunities.pipelineStages.list()]); setReport(nextReport); setPipelineStages(stageSettings.stages) }
    catch { setError(t('funnelReport.loadFailed')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  const closedCount = (report?.wonInPeriodCount ?? 0) + (report?.lostInPeriodCount ?? 0)
  const winRate = closedCount ? Math.round((report!.wonInPeriodCount / closedCount) * 100) : null
  const currentLeadCount = report?.leadCountsByStatus.reduce((total, item) => total + item.count, 0) ?? 0
  const money = (currency: string, amount: string) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount))
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))

  return <section className="leads-page funnel-report-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('funnelReport.eyebrow')}</p><h2>{t('funnelReport.title')}</h2><p className="muted">{t('funnelReport.description')}</p></div><button className="refresh" onClick={() => void refresh()} aria-label={t('funnelReport.refresh')}><RefreshCw size={16} /></button></header>
    <form className="funnel-report-filter" onSubmit={(event) => { event.preventDefault(); void refresh() }}><label>{t('funnelReport.from')}<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} required /></label><label>{t('funnelReport.to')}<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} required /></label><button className="primary">{t('funnelReport.apply')}</button></form>
    {error && report && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    {loading && report && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
    {loading && !report ? <WorkspaceState kind="loading" message={t('common.loading')} /> : report && <>
      <div className="funnel-report-metrics">
        <article><span>{t('funnelReport.currentOpen')}</span><strong>{report.currentOpenCount}</strong><small>{t('funnelReport.currentOpenHint')}</small></article>
        <article><span><TrendingUp size={15} />{t('funnelReport.won')}</span><strong>{report.wonInPeriodCount}</strong><small>{report.wonAmountByCurrency.length ? report.wonAmountByCurrency.map((item) => money(item.currency, item.amount)).join(' · ') : t('funnelReport.noWonValue')}</small></article>
        <article><span><TrendingDown size={15} />{t('funnelReport.lost')}</span><strong>{report.lostInPeriodCount}</strong><small>{winRate === null ? t('funnelReport.noDecisions') : t('funnelReport.winRate', { rate: winRate })}</small></article>
        <article className={report.openWithoutNextActionCount || report.overdueNextActionCount ? 'risk' : ''}><span><AlertTriangle size={15} />{t('funnelReport.needsAttention')}</span><strong>{report.openWithoutNextActionCount + report.overdueNextActionCount}</strong><small>{t('funnelReport.attentionBreakdown', { missing: report.openWithoutNextActionCount, overdue: report.overdueNextActionCount })}</small></article>
        <article><span>{t('leadFunnelReport.created')}</span><strong>{report.leadsCreatedInPeriodCount}</strong><small>{t('leadFunnelReport.createdHint')}</small></article>
      </div>
      <section className="funnel-report-panel"><div className="funnel-report-panel-head"><div><h3>{t('leadFunnelReport.title')}</h3><p>{t('leadFunnelReport.hint')}</p></div><span>{currentLeadCount}</span></div><div className="funnel-stage-list">{leadStatuses.map((status) => { const count = report.leadCountsByStatus.find((item) => item.status === status)?.count ?? 0; const width = currentLeadCount ? Math.max((count / currentLeadCount) * 100, count ? 3 : 0) : 0; return <div className="funnel-stage-row" key={status}><span>{t(`leadStatuses.${status}`)}</span><div className="funnel-stage-track"><i style={{ width: `${width}%` }} /></div><strong>{count}</strong></div> })}</div></section>
      <section className="funnel-report-panel handoff-report-panel"><div><h3>{t('handoffFirstActivity.title')}</h3><p>{t('handoffFirstActivity.description')}</p></div><strong>{report.averageMinutesToFirstActivity === null ? '—' : durationLabel(report.averageMinutesToFirstActivity, i18n.language)}</strong><small>{t('handoffFirstActivity.breakdown', { tracked: report.firstActivityCount, accepted: report.acceptedHandoffsInPeriodCount, pending: report.pendingFirstActivityCount })}</small></section>
      <section className="funnel-report-panel"><div className="funnel-report-panel-head"><div><h3>{t('funnelReport.stageSnapshot')}</h3><p>{t('funnelReport.stageSnapshotHint')}</p></div><span>{report.currentOpenCount}</span></div><div className="funnel-stage-list">{pipelineStages.filter((stage) => stage.isActive && stage.stage !== 'won' && stage.stage !== 'lost').map((stage) => { const count = report.currentStages.find((item) => item.stage === stage.stage && (stage.isSystem || item.pipelineStageKey === stage.key))?.count ?? 0; const width = report.currentOpenCount ? Math.max((count / report.currentOpenCount) * 100, count ? 3 : 0) : 0; return <div className="funnel-stage-row" key={stage.key}><span>{stage.isSystem ? t(`opportunityStages.${stage.stage}`) : stage.name}</span><div className="funnel-stage-track"><i style={{ width: `${width}%` }} /></div><strong>{count}</strong></div> })}</div></section>
      <p className="funnel-report-definition">{t('funnelReport.definitions', { from: dateLabel(report.from), to: dateLabel(report.to), created: report.createdInPeriodCount })}</p>
      <p className="funnel-report-updated">{t('funnelReport.updatedAt', { value: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(report.generatedAt)) })}</p>
    </>}
    {!loading && !report && error && <WorkspaceState kind="error" message={error} />}
  </section>
}
