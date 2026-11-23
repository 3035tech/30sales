import { useEffect, useState, type FormEvent } from 'react'
import { Activity, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, SelectField, TextField } from '../components/ui/FormControls'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api } from '../lib/api'
import { PLATFORM_AI_USAGE_DEFAULT_PAGE_OFFSET, PLATFORM_AI_USAGE_DEFAULT_PAGE_SIZE, PLATFORM_AI_USAGE_MAXIMUM_RANGE_DAYS, PLATFORM_AI_USAGE_MILLISECONDS_PER_DAY, PLATFORM_AI_USAGE_PAGE_SIZES } from '../lib/authorizationConstants'
import './PlatformAiUsagePanel.css'

type AiUsageReport = Awaited<ReturnType<typeof api.platform.aiUsage>>

function defaultPeriod() {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - 29)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

function isValidPeriod(fromValue: string, toValue: string) {
  const from = new Date(`${fromValue}T00:00:00.000Z`).getTime()
  const to = new Date(`${toValue}T00:00:00.000Z`).getTime()
  return Number.isFinite(from) && Number.isFinite(to) && from <= to && (to - from) / PLATFORM_AI_USAGE_MILLISECONDS_PER_DAY < PLATFORM_AI_USAGE_MAXIMUM_RANGE_DAYS
}

export function PlatformAiUsagePanel() {
  const { t, i18n } = useTranslation()
  const [draftRange, setDraftRange] = useState(defaultPeriod)
  const [appliedRange, setAppliedRange] = useState(draftRange)
  const [rangeError, setRangeError] = useState(false)
  const [report, setReport] = useState<AiUsageReport | null>(null)
  const [pageSize, setPageSize] = useState<number>(PLATFORM_AI_USAGE_DEFAULT_PAGE_SIZE)
  const [offset, setOffset] = useState<number>(PLATFORM_AI_USAGE_DEFAULT_PAGE_OFFSET)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    api.platform.aiUsage({ ...appliedRange, limit: pageSize, offset })
      .then((result) => { if (active) setReport(result) })
      .catch(() => { if (active) setLoadError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [appliedRange, pageSize, offset, refreshVersion])

  const applyRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!isValidPeriod(draftRange.from, draftRange.to)) {
      setRangeError(true)
      return
    }
    setRangeError(false)
    setLoading(true)
    setLoadError(false)
    setReport(null)
    setOffset(PLATFORM_AI_USAGE_DEFAULT_PAGE_OFFSET)
    setAppliedRange({ ...draftRange })
  }

  const refresh = () => {
    setLoading(true)
    setLoadError(false)
    setReport(null)
    setRefreshVersion((version) => version + 1)
  }

  const changePageSize = (value: string) => {
    setLoading(true)
    setLoadError(false)
    setReport(null)
    setPageSize(Number(value))
    setOffset(PLATFORM_AI_USAGE_DEFAULT_PAGE_OFFSET)
  }

  const changePage = (nextOffset: number) => {
    setLoading(true)
    setLoadError(false)
    setReport(null)
    setOffset(nextOffset)
  }

  const currency = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 10 })
  const number = new Intl.NumberFormat(i18n.language)
  const currentPage = Math.floor(offset / pageSize) + 1
  const totalPages = Math.max(1, Math.ceil((report?.pagination.total ?? 0) / pageSize))
  const firstItem = report?.pagination.total ? offset + 1 : 0
  const lastItem = Math.min(offset + pageSize, report?.pagination.total ?? 0)
  const updatedAt = report ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.generatedAt)) : null

  return <section className="platform-panel platform-ai-usage-panel" aria-labelledby="platform-ai-usage-title">
    <div className="platform-panel-heading">
      <span className="card-icon" aria-hidden="true"><Activity size={18} /></span>
      <div><h2 id="platform-ai-usage-title">{t('platformAiUsage.title')}</h2><p>{t('platformAiUsage.description')}</p></div>
    </div>

    <form className="platform-ai-usage-filters" onSubmit={applyRange} aria-label={t('platformAiUsage.title')}>
      <label>{t('platformAiUsage.from')}<TextField type="date" value={draftRange.from} max={draftRange.to} onChange={(event) => { setRangeError(false); setDraftRange((current) => ({ ...current, from: event.target.value })) }} required /></label>
      <label>{t('platformAiUsage.to')}<TextField type="date" value={draftRange.to} min={draftRange.from} onChange={(event) => { setRangeError(false); setDraftRange((current) => ({ ...current, to: event.target.value })) }} required /></label>
      <Button className="primary" type="submit">{t('platformAiUsage.apply')}</Button>
      <Button type="button" aria-label={t('platformAiUsage.refresh')} onClick={refresh} disabled={loading}><RefreshCw size={16} aria-hidden="true" />{t('platformAiUsage.refresh')}</Button>
    </form>
    {rangeError && <p className="platform-ai-usage-range-error" role="alert">{t('platformAiUsage.rangeInvalid')}</p>}

    <div className="platform-ai-usage-context">
      <p>{t('platformAiUsage.estimateNote')}</p>
      {updatedAt && <time dateTime={report?.generatedAt}>{t('platformAiUsage.updatedAt', { date: updatedAt })}</time>}
    </div>

    {report && <div className="platform-ai-usage-summary" aria-label={t('platformAiUsage.title')}>
      <article className="cost"><span>{t('platformAiUsage.estimatedCost')}</span><strong>{report.estimatedCostUsd === null ? '—' : currency.format(Number(report.estimatedCostUsd))}</strong></article>
      <article><span>{t('platformAiUsage.requestCount')}</span><strong>{number.format(report.requestCount)}</strong></article>
      <article><span>{t('platformAiUsage.inputTokens')}</span><strong>{number.format(report.inputTokens)}</strong></article>
      <article><span>{t('platformAiUsage.outputTokens')}</span><strong>{number.format(report.outputTokens)}</strong></article>
      <article className={report.unpricedRequestCount ? 'unpriced' : ''}><span>{t('platformAiUsageLabels.unpricedRequests', { count: number.format(report.unpricedRequestCount) })}</span><strong>{number.format(report.unpricedRequestCount)}</strong></article>
    </div>}

    <p className="platform-ai-usage-scope">{t('platformAiUsage.scopeNote')}</p>
    {loading && !report ? <WorkspaceState kind="loading" compact message={t('platformAiUsage.loading')} /> : loadError && !report ? <WorkspaceState kind="error" compact message={t('platformAiUsage.loadFailed')}><Button type="button" onClick={refresh}>{t('platform.retry')}</Button></WorkspaceState> : report?.points.length ? <>
      <div className="platform-ai-usage-list-header" aria-hidden="true"><span>{t('platformAiUsage.organization')}</span><span>{t('platformAiUsage.model')}</span><span>{t('platformAiUsage.tokens')}</span><span>{t('platformAiUsage.requestCount')}</span><span>{t('platformAiUsage.estimatedCostShort')}</span></div>
      <ol className="platform-ai-usage-list">
        {report.points.map((point) => <li key={`${point.organizationId}-${point.operation}-${point.model}`}>
          <div className="platform-ai-usage-company"><strong>{point.organizationName}</strong><small>{point.organizationSlug}</small></div>
          <div className="platform-ai-usage-operation"><strong>{t(`platformAiUsage.operations.${point.operation}`, { defaultValue: point.operation })}</strong><small>{point.model}</small></div>
          <span className="platform-ai-usage-tokens" aria-label={t('platformAiUsage.tokenBreakdown', { input: number.format(point.inputTokens), output: number.format(point.outputTokens) })}>{number.format(point.inputTokens)} <i aria-hidden="true">/</i> {number.format(point.outputTokens)}</span>
          <span className="platform-ai-usage-requests">{number.format(point.requestCount)}</span>
          <div className="platform-ai-usage-cost"><strong>{point.estimatedCostUsd === null ? '—' : currency.format(Number(point.estimatedCostUsd))}</strong>{Boolean(point.unpricedRequestCount) && <small>{t('platformAiUsageLabels.unpricedRequests', { count: number.format(point.unpricedRequestCount) })}</small>}</div>
        </li>)}
      </ol>
      <div className="platform-ai-usage-pagination">
        <label>{t('platformAiUsage.itemsPerPage')}<SelectField value={pageSize} onChange={(event) => changePageSize(event.target.value)}>{PLATFORM_AI_USAGE_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</SelectField></label>
        <span className="platform-ai-usage-page-range">{t('platformAiUsage.pageRange', { first: number.format(firstItem), last: number.format(lastItem), total: number.format(report.pagination.total) })}</span>
        <span className="platform-ai-usage-page-number">{t('platformAiUsage.page', { current: currentPage, total: totalPages })}</span>
        <div><Button type="button" aria-label={t('common.previousPage')} disabled={offset === PLATFORM_AI_USAGE_DEFAULT_PAGE_OFFSET} onClick={() => changePage(Math.max(PLATFORM_AI_USAGE_DEFAULT_PAGE_OFFSET, offset - pageSize))}><ChevronLeft size={17} /></Button><Button type="button" aria-label={t('common.nextPage')} disabled={!report.pagination.hasNextPage} onClick={() => changePage(offset + pageSize)}><ChevronRight size={17} /></Button></div>
      </div>
    </> : report && !loading && !loadError ? <WorkspaceState kind="empty" compact message={t('platformAiUsage.empty')} /> : null}
  </section>
}
