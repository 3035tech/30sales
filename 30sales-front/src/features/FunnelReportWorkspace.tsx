import { useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type FunnelReportDto, type OpportunityStage } from '../lib/api/client'
import './FunnelReportWorkspace.css'

const stages: OpportunityStage[] = ['qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation']
function dateInput(date: Date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10) }

export function FunnelReportWorkspace() {
  const { t, i18n } = useTranslation()
  const today = dateInput(new Date())
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 29)
  const [from, setFrom] = useState(dateInput(monthAgo))
  const [to, setTo] = useState(today)
  const [report, setReport] = useState<FunnelReportDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const refresh = async () => {
    setLoading(true); setError('')
    try { setReport(await api.reports.funnel(from, to)) }
    catch { setError(t('funnelReport.loadFailed')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])
  const closedCount = (report?.wonInPeriodCount ?? 0) + (report?.lostInPeriodCount ?? 0)
  const winRate = closedCount ? Math.round((report!.wonInPeriodCount / closedCount) * 100) : null
  const money = (currency: string, amount: string) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount))
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))

  return <section className="leads-page funnel-report-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('funnelReport.eyebrow')}</p><h2>{t('funnelReport.title')}</h2><p className="muted">{t('funnelReport.description')}</p></div><button className="refresh" onClick={() => void refresh()} aria-label={t('funnelReport.refresh')}><RefreshCw size={16} /></button></header>
    <form className="funnel-report-filter" onSubmit={(event) => { event.preventDefault(); void refresh() }}><label>{t('funnelReport.from')}<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} required /></label><label>{t('funnelReport.to')}<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} required /></label><button className="primary">{t('funnelReport.apply')}</button></form>
    {error && <p className="error lead-error">{error}</p>}
    {loading ? <div className="lead-empty">{t('common.loading')}</div> : report && <>
      <div className="funnel-report-metrics">
        <article><span>{t('funnelReport.currentOpen')}</span><strong>{report.currentOpenCount}</strong><small>{t('funnelReport.currentOpenHint')}</small></article>
        <article><span><TrendingUp size={15} />{t('funnelReport.won')}</span><strong>{report.wonInPeriodCount}</strong><small>{report.wonAmountByCurrency.length ? report.wonAmountByCurrency.map((item) => money(item.currency, item.amount)).join(' · ') : t('funnelReport.noWonValue')}</small></article>
        <article><span><TrendingDown size={15} />{t('funnelReport.lost')}</span><strong>{report.lostInPeriodCount}</strong><small>{winRate === null ? t('funnelReport.noDecisions') : t('funnelReport.winRate', { rate: winRate })}</small></article>
        <article className={report.openWithoutNextActionCount || report.overdueNextActionCount ? 'risk' : ''}><span><AlertTriangle size={15} />{t('funnelReport.needsAttention')}</span><strong>{report.openWithoutNextActionCount + report.overdueNextActionCount}</strong><small>{t('funnelReport.attentionBreakdown', { missing: report.openWithoutNextActionCount, overdue: report.overdueNextActionCount })}</small></article>
      </div>
      <section className="funnel-report-panel"><div className="funnel-report-panel-head"><div><h3>{t('funnelReport.stageSnapshot')}</h3><p>{t('funnelReport.stageSnapshotHint')}</p></div><span>{report.currentOpenCount}</span></div><div className="funnel-stage-list">{stages.map((stage) => { const count = report.currentStages.find((item) => item.stage === stage)?.count ?? 0; const width = report.currentOpenCount ? Math.max((count / report.currentOpenCount) * 100, count ? 3 : 0) : 0; return <div className="funnel-stage-row" key={stage}><span>{t(`opportunityStages.${stage}`)}</span><div className="funnel-stage-track"><i style={{ width: `${width}%` }} /></div><strong>{count}</strong></div> })}</div></section>
      <p className="funnel-report-definition">{t('funnelReport.definitions', { from: dateLabel(report.from), to: dateLabel(report.to), created: report.createdInPeriodCount })}</p>
      <p className="funnel-report-updated">{t('funnelReport.updatedAt', { value: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(report.generatedAt)) })}</p>
    </>}
  </section>
}
