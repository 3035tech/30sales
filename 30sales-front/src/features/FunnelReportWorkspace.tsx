import { Button, CalendarField } from '../components/ui/FormControls'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, ASSISTANT_RUN_OPERATION, ASSISTANT_RUN_STATUS, OPPORTUNITY_STAGE, type AiUsageReportDto, type FunnelReportDto, type LeadStatus } from '../lib/api'
import './FunnelReportWorkspace.css'
import './HandoffReport.css'
import './LeadFunnelReport.css'
import './AiUsageReport.css'
import { DailyActivityReport } from './DailyActivityReport'

const leadStatuses: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']
function dateInput(date: Date) { const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10) }
function durationLabel(minutes: number, locale: string) {
  const totalMinutes = Math.max(0, Math.round(minutes))
  const hours = Math.floor(totalMinutes / 60)
  const remainder = totalMinutes % 60
  const format = (value: number, unit: 'hour' | 'minute') => new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short' }).format(value)
  return hours ? `${format(hours, 'hour')}${remainder ? ` ${format(remainder, 'minute')}` : ''}` : format(remainder, 'minute')
}

export function FunnelReportWorkspace({ organizationId, canManageActivity }: { organizationId: string; canManageActivity: boolean }) {
  const { t, i18n } = useTranslation()
  const [searchParams] = useSearchParams()
  const businessLineId = searchParams.get('businessLineId') ?? undefined
  const [today] = useState(() => dateInput(new Date()))
  const [initialRange] = useState(() => { const start = new Date(); start.setDate(start.getDate() - 29); return dateInput(start) })
  const [from, setFrom] = useState(initialRange)
  const [to, setTo] = useState(today)
  const [reportData, setReportData] = useState<FunnelReportDto | null>(null)
  const [reportBusinessLineId, setReportBusinessLineId] = useState<string | undefined>()
  const [aiUsageData, setAiUsageData] = useState<AiUsageReportDto | null>(null)
  const [aiUsageQueryKey, setAiUsageQueryKey] = useState<string | null>(null)
  const [aiUsageUnavailable, setAiUsageUnavailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestVersion = useRef(0)
  const reportQueryKey = JSON.stringify([businessLineId ?? null, from, to])

  const refresh = async () => {
    const version = ++requestVersion.current
    setLoading(true); setError('')
    const queryKey = JSON.stringify([businessLineId ?? null, from, to])
    const [reportResult, aiUsageResult] = await Promise.allSettled([
      api.reports.funnel(from, to, businessLineId),
      api.reports.aiUsage(from, to, businessLineId),
    ])
    if (version !== requestVersion.current) return
    if (reportResult.status === 'fulfilled') {
      setReportData(reportResult.value); setReportBusinessLineId(businessLineId)
    } else {
      setError(t('funnelReport.loadFailed'))
    }
    if (aiUsageResult.status === 'fulfilled') {
      setAiUsageData(aiUsageResult.value); setAiUsageQueryKey(queryKey); setAiUsageUnavailable(false)
    } else {
      setAiUsageData(null); setAiUsageQueryKey(queryKey); setAiUsageUnavailable(true)
    }
    setLoading(false)
  }
  const refreshRef = useRef(refresh)
  useEffect(() => { refreshRef.current = refresh })
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void refreshRef.current() })
    return () => { active = false; requestVersion.current += 1 }
  }, [businessLineId])
  const report = reportBusinessLineId === businessLineId ? reportData : null
  const aiUsage = aiUsageQueryKey === reportQueryKey ? aiUsageData : null
  const aiUsageUnavailableForQuery = aiUsageQueryKey === reportQueryKey && aiUsageUnavailable
  const closedCount = (report?.wonInPeriodCount ?? 0) + (report?.lostInPeriodCount ?? 0)
  const winRate = report && closedCount ? Math.round((report.wonInPeriodCount / closedCount) * 100) : null
  const currentLeadCount = report?.leadCountsByStatus.reduce((total, item) => total + item.count, 0) ?? 0
  const money = (currency: string, amount: string) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(amount))
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))
  const aiDays = Object.values((aiUsage?.points ?? []).reduce<Record<string, { date: string; generations: number; transcriptions: number; failures: number; latencyTotal: number; latencyCount: number; cost: number }>>((days, point) => {
    const day = days[point.date] ?? { date: point.date, generations: 0, transcriptions: 0, failures: 0, latencyTotal: 0, latencyCount: 0, cost: 0 }
    if (point.operation === ASSISTANT_RUN_OPERATION.replyGeneration) day.generations += point.runCount
    else day.transcriptions += point.runCount
    if (point.status === ASSISTANT_RUN_STATUS.failed) day.failures += point.runCount
    if (point.averageLatencyMs !== null && point.latencySampleCount > 0) { day.latencyTotal += point.averageLatencyMs * point.latencySampleCount; day.latencyCount += point.latencySampleCount }
    if (point.estimatedCostUsd !== null) day.cost += Number(point.estimatedCostUsd)
    days[point.date] = day
    return days
  }, {})).sort((left, right) => left.date.localeCompare(right.date))
  const maxAiRuns = Math.max(1, ...aiDays.map((day) => day.generations + day.transcriptions))
  const maxSalesEvents = Math.max(1, ...report?.salesTrend.flatMap((day) => [day.leadsCreated, day.opportunitiesCreated, day.won, day.lost]) ?? [])
  const salesMetrics = [
    { key: 'leads', label: 'leadsCreated', className: 'leads', read: (day: FunnelReportDto['salesTrend'][number]) => day.leadsCreated },
    { key: 'opportunities', label: 'opportunitiesCreated', className: 'opportunities', read: (day: FunnelReportDto['salesTrend'][number]) => day.opportunitiesCreated },
    { key: 'won', label: 'won', className: 'won', read: (day: FunnelReportDto['salesTrend'][number]) => day.won },
    { key: 'lost', label: 'lost', className: 'lost', read: (day: FunnelReportDto['salesTrend'][number]) => day.lost },
  ] as const
  const stageAgingRows = (report?.stageAging ?? []).map((item) => {
    return { ...item, label: item.stage === OPPORTUNITY_STAGE.custom ? item.pipelineStageName ?? item.pipelineStageKey ?? t(`opportunityStages.${item.stage}`) : t(`opportunityStages.${item.stage}`) }
  })
  const stageSnapshotRows = (report?.currentStages ?? []).map((item) => {
    return { ...item, label: item.stage === OPPORTUNITY_STAGE.custom ? item.pipelineStageName ?? item.pipelineStageKey ?? t(`opportunityStages.${item.stage}`) : t(`opportunityStages.${item.stage}`) }
  })
  const pipelineValueRows = (report?.pipelineValues ?? []).map((item) => {
    return { ...item, label: item.stage === OPPORTUNITY_STAGE.custom ? item.pipelineStageName ?? item.pipelineStageKey ?? t(`opportunityStages.${item.stage}`) : t(`opportunityStages.${item.stage}`) }
  })
  const cohortMetrics = [
    { key: 'responded', label: 'responded', count: (cohort: FunnelReportDto['leadCohorts'][number]) => cohort.respondedCount, rate: (cohort: FunnelReportDto['leadCohorts'][number]) => cohort.respondedRate, className: 'responded' },
    { key: 'convertedToSdr', label: 'convertedToSdr', count: (cohort: FunnelReportDto['leadCohorts'][number]) => cohort.convertedToSdrCount, rate: (cohort: FunnelReportDto['leadCohorts'][number]) => cohort.convertedToSdrRate, className: 'converted-to-sdr' },
    { key: 'opportunity', label: 'opportunity', count: (cohort: FunnelReportDto['leadCohorts'][number]) => cohort.opportunityCount, rate: (cohort: FunnelReportDto['leadCohorts'][number]) => cohort.opportunityRate, className: 'opportunity' },
  ] as const

  return <section className="leads-page funnel-report-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('funnelReport.eyebrow')}</p><h2>{t('funnelReport.title')}</h2><p className="muted">{t('funnelReport.description')}</p></div><Button className="refresh" onClick={() => void refresh()} aria-label={t('funnelReport.refresh')}><RefreshCw size={16} /></Button></header>
    <form className="funnel-report-filter" onSubmit={(event) => { event.preventDefault(); void refresh() }}><label>{t('funnelReport.from')}<CalendarField mode="date" value={from} max={to} onValueChange={(value) => setFrom(value)} required /></label><label>{t('funnelReport.to')}<CalendarField mode="date" value={to} min={from} max={today} onValueChange={(value) => setTo(value)} required /></label><Button className="primary">{t('funnelReport.apply')}</Button></form>
    <p className="funnel-report-scope" role="note">{t(businessLineId ? 'funnelReport.lineScope' : 'funnelReport.portfolioScope')}</p>
    <DailyActivityReport organizationId={organizationId} businessLineId={businessLineId} date={to} canManage={canManageActivity} />
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
      <section className="funnel-report-panel sales-trend-panel"><div className="funnel-report-panel-head"><div><h3>{t('funnelReport.salesTrendTitle')}</h3><p>{t('funnelReport.salesTrendHint')}</p></div><span>{report.salesTrend.reduce((sum, day) => sum + day.leadsCreated + day.opportunitiesCreated + day.won + day.lost, 0)}</span></div>{report.salesTrend.length ? <><div className="sales-trend-chart" aria-hidden="true">{report.salesTrend.map((day) => <div className="sales-trend-row" key={day.date}><time dateTime={day.date}>{new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: 'short' }).format(new Date(`${day.date}T12:00:00`))}</time><div className="sales-trend-metrics">{salesMetrics.map((metric) => { const value = metric.read(day); return <span className={`sales-trend-metric ${metric.className}`} key={metric.key}><i style={{ width: `${(value / maxSalesEvents) * 100}%` }} /><b>{value}</b></span> })}</div></div>)}</div><div className="sales-trend-legend">{salesMetrics.map((metric) => <span className={metric.className} key={metric.key}><i />{t(`funnelReport.salesTrendColumns.${metric.label}`)}</span>)}</div><table className="sr-only"><caption>{t('funnelReport.salesTrendAccessible')}</caption><thead><tr><th scope="col">{t('funnelReport.aiUsageColumns.date')}</th>{salesMetrics.map((metric) => <th scope="col" key={metric.key}>{t(`funnelReport.salesTrendColumns.${metric.label}`)}</th>)}</tr></thead><tbody>{report.salesTrend.map((day) => <tr key={day.date}><th scope="row">{dateLabel(day.date)}</th><td>{day.leadsCreated}</td><td>{day.opportunitiesCreated}</td><td>{day.won}</td><td>{day.lost}</td></tr>)}</tbody></table></> : <p className="ai-usage-empty">{t('funnelReport.salesTrendEmpty')}</p>}</section>
      <section className="funnel-report-panel lead-cohort-panel"><div className="funnel-report-panel-head"><div><h3>{t('funnelReport.cohortTitle')}</h3><p>{t('funnelReport.cohortHint')}</p></div><span>{report.leadCohorts.reduce((sum, cohort) => sum + cohort.leadCount, 0)}</span></div>{report.leadCohorts.length ? <><div className="cohort-chart" aria-hidden="true">{report.leadCohorts.map((cohort) => <div className="cohort-row" key={cohort.date}><div className="cohort-label"><time dateTime={cohort.date}>{dateLabel(cohort.date)}</time><small>{t('funnelReport.cohortAge', { days: cohort.ageDays })} · n={cohort.leadCount}</small></div><div className="cohort-rates">{cohortMetrics.map((metric) => <span className={metric.className} key={metric.key}><i style={{ width: `${metric.rate(cohort)}%` }} /><b>{metric.rate(cohort).toFixed(1)}%</b><small>{metric.count(cohort)}</small></span>)}</div></div>)}</div><div className="cohort-legend">{cohortMetrics.map((metric) => <span className={metric.className} key={metric.key}><i />{t(`funnelReport.cohortColumns.${metric.label}`)}</span>)}</div><table className="sr-only"><caption>{t('funnelReport.cohortAccessible')}</caption><thead><tr><th scope="col">{t('funnelReport.aiUsageColumns.date')}</th><th scope="col">{t('funnelReport.cohortColumns.population')}</th>{cohortMetrics.map((metric) => <th scope="col" key={metric.key}>{t(`funnelReport.cohortColumns.${metric.label}`)}</th>)}<th scope="col">{t('funnelReport.cohortColumns.age')}</th></tr></thead><tbody>{report.leadCohorts.map((cohort) => <tr key={cohort.date}><th scope="row">{dateLabel(cohort.date)}</th><td>{cohort.leadCount}</td>{cohortMetrics.map((metric) => <td key={metric.key}>{metric.count(cohort)} ({metric.rate(cohort).toFixed(1)}%)</td>)}<td>{cohort.ageDays}</td></tr>)}</tbody></table></> : <p className="ai-usage-empty">{t('funnelReport.cohortEmpty')}</p>}</section>
      <section className="funnel-report-panel ai-usage-panel"><div className="funnel-report-panel-head"><div><h3>{t('funnelReport.aiUsageTitle')}</h3><p>{t('funnelReport.aiUsageHint')}</p><p>{t('funnelReport.aiUsagePeriod', { from: dateLabel(from), to: dateLabel(to) })}</p></div><span>{aiUsage ? aiDays.reduce((sum, day) => sum + day.generations + day.transcriptions, 0) : '—'}</span></div>{aiUsage && aiDays.length ? <><div className="ai-usage-chart" aria-hidden="true"><div className="ai-usage-legend"><span><i />{t('funnelReport.aiUsageRuns')}</span><span><i />{t('funnelReport.aiUsageFailures')}</span></div>
        {aiDays.map((day) => <div className="ai-usage-row" key={day.date}><time dateTime={day.date}>{new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: 'short' }).format(new Date(`${day.date}T12:00:00`))}</time><div className="ai-usage-track"><i style={{ width: `${((day.generations + day.transcriptions) / maxAiRuns) * 100}%` }} /><b style={{ width: `${(day.failures / maxAiRuns) * 100}%` }} /></div><span>{t('funnelReport.aiUsageCounts', { generations: day.generations, transcriptions: day.transcriptions, failures: day.failures })}</span><small>{day.latencyCount ? t('funnelReport.aiUsageLatency', { value: Math.round(day.latencyTotal / day.latencyCount) }) : '—'} · {new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(day.cost)}</small></div>)}
      </div><table className="sr-only"><caption>{t('funnelReport.aiUsageAccessible')}</caption><thead><tr>{['date', 'generations', 'transcriptions', 'failures', 'latency', 'cost'].map((key) => <th key={key} scope="col">{t(`funnelReport.aiUsageColumns.${key}`)}</th>)}</tr></thead><tbody>{aiDays.map((day) => <tr key={day.date}><th scope="row">{dateLabel(day.date)}</th><td>{day.generations}</td><td>{day.transcriptions}</td><td>{day.failures}</td><td>{day.latencyCount ? Math.round(day.latencyTotal / day.latencyCount) : '—'}</td><td>{day.cost.toFixed(10)}</td></tr>)}</tbody></table></> : <p className="ai-usage-empty">{t(aiUsageUnavailableForQuery ? 'funnelReport.aiUsageUnavailable' : aiUsage ? 'funnelReport.aiUsageEmpty' : loading ? 'funnelReport.aiUsageLoading' : 'funnelReport.aiUsageApply')}</p>}</section>
      <section className="funnel-report-panel"><div className="funnel-report-panel-head"><div><h3>{t('leadFunnelReport.title')}</h3><p>{t('leadFunnelReport.hint')}</p></div><span>{currentLeadCount}</span></div><div className="funnel-stage-list">{leadStatuses.map((status) => { const count = report.leadCountsByStatus.find((item) => item.status === status)?.count ?? 0; const width = currentLeadCount ? Math.max((count / currentLeadCount) * 100, count ? 3 : 0) : 0; return <div className="funnel-stage-row" key={status}><span>{t(`leadStatuses.${status}`)}</span><div className="funnel-stage-track"><i style={{ width: `${width}%` }} /></div><strong>{count}</strong></div> })}</div></section>
      <section className="funnel-report-panel handoff-report-panel"><div><h3>{t('handoffFirstActivity.title')}</h3><p>{t('handoffFirstActivity.description')}</p></div><strong>{report.averageMinutesToFirstActivity === null ? '—' : durationLabel(report.averageMinutesToFirstActivity, i18n.language)}</strong><small>{t('handoffFirstActivity.breakdown', { tracked: report.firstActivityCount, accepted: report.acceptedHandoffsInPeriodCount, pending: report.pendingFirstActivityCount })}</small></section>
      <section className="funnel-report-panel"><div className="funnel-report-panel-head"><div><h3>{t('funnelReport.stageSnapshot')}</h3><p>{t('funnelReport.stageSnapshotHint')}</p></div><span>{report.currentOpenCount}</span></div>{stageSnapshotRows.length ? <div className="funnel-stage-list">{stageSnapshotRows.map((stage) => { const width = report.currentOpenCount ? Math.max((stage.count / report.currentOpenCount) * 100, stage.count ? 3 : 0) : 0; return <div className="funnel-stage-row" key={`${stage.stage}:${stage.pipelineStageKey ?? stage.stage}:${stage.pipelineStageName ?? ''}`}><span>{stage.label}</span><div className="funnel-stage-track"><i style={{ width: `${width}%` }} /></div><strong>{stage.count}</strong></div> })}</div> : <p className="stage-aging-empty">{t('funnelReport.stageSnapshotEmpty')}</p>}</section><section className="funnel-report-panel stage-aging-panel"><div className="funnel-report-panel-head"><div><h3>{t('funnelReport.stageAging.title')}</h3><p>{t('funnelReport.stageAging.hint')}</p></div><span>{stageAgingRows.reduce((total, row) => total + row.upTo7DaysCount + row.days8To14Count + row.days15To30Count + row.over30DaysCount, 0)}</span></div>{stageAgingRows.length ? <div className="stage-aging-table-wrap"><table><thead><tr><th scope="col">{t('funnelReport.stageAging.stage')}</th><th scope="col">{t('funnelReport.stageAging.upTo7Days')}</th><th scope="col">{t('funnelReport.stageAging.days8To14')}</th><th scope="col">{t('funnelReport.stageAging.days15To30')}</th><th scope="col">{t('funnelReport.stageAging.over30Days')}</th></tr></thead><tbody>{stageAgingRows.map((row) => <tr key={`${row.stage}:${row.pipelineStageKey ?? row.stage}:${row.pipelineStageName ?? ''}`}><th scope="row">{row.label}</th><td>{row.upTo7DaysCount}</td><td>{row.days8To14Count}</td><td>{row.days15To30Count}</td><td className={row.over30DaysCount ? 'stage-aging-risk' : ''}>{row.over30DaysCount}</td></tr>)}</tbody></table></div> : <p className="stage-aging-empty">{t('funnelReport.stageAging.empty')}</p>}</section><section className="funnel-report-panel pipeline-value-panel"><div className="funnel-report-panel-head"><div><h3>{t('funnelReport.pipelineValue.title')}</h3><p>{t('funnelReport.pipelineValue.hint', { unvalued: report.openWithoutValueCount })}</p></div><span>{pipelineValueRows.reduce((total, row) => total + row.opportunityCount, 0)}</span></div>{pipelineValueRows.length ? <div className="pipeline-value-table-wrap"><table><thead><tr><th scope="col">{t('funnelReport.pipelineValue.stage')}</th><th scope="col">{t('funnelReport.pipelineValue.currency')}</th><th scope="col">{t('funnelReport.pipelineValue.amount')}</th><th scope="col">{t('funnelReport.pipelineValue.opportunities')}</th></tr></thead><tbody>{pipelineValueRows.map((row) => <tr key={`${row.stage}:${row.pipelineStageKey ?? row.stage}:${row.pipelineStageName ?? ''}:${row.currency}`}><th scope="row">{row.label}</th><td>{row.currency}</td><td>{money(row.currency, row.amount)}</td><td>{row.opportunityCount}</td></tr>)}</tbody></table></div> : <p className="stage-aging-empty">{t('funnelReport.pipelineValue.empty')}</p>}</section>
      <p className="funnel-report-definition">{t('funnelReport.definitions', { from: dateLabel(report.from), to: dateLabel(report.to), created: report.createdInPeriodCount })}</p>
      <p className="funnel-report-updated">{t('funnelReport.updatedAt', { value: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(report.generatedAt)) })}</p>
    </>}
    {!loading && !report && error && <WorkspaceState kind="error" message={error} />}
  </section>
}
