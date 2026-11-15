import { Button, CalendarField, SelectField, TextField } from '../components/ui/FormControls'
import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type AuditEventDto, type AuditEventsPageDto } from '../lib/api/client'
import './AuditWorkspace.css'

const pageSizes = [10, 25, 50, 100]

export function AuditWorkspace() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState<AuditEventsPageDto | null>(null)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setPage(await api.audit.list({ action: action.trim() || undefined, entityType: entityType || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(to).toISOString() : undefined, limit, offset }))
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [action, entityType, from, to, limit, offset])

  useEffect(() => { void refresh() }, [refresh])
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const entityLabel = (value: string) => value === 'messaging_channel' ? t('channels.columns.name') : t(`audit.entities.${value}`, { defaultValue: value })
  const stateLabel = (event: AuditEventDto) => {
    if (!event.beforeState && !event.afterState) return null
    return <details className="audit-state"><summary>{t('audit.viewChange')}</summary><div><strong>{t('audit.before')}</strong><pre>{JSON.stringify(event.beforeState, null, 2) ?? '—'}</pre><strong>{t('audit.after')}</strong><pre>{JSON.stringify(event.afterState, null, 2) ?? '—'}</pre></div></details>
  }

  return <section className="leads-page audit-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('audit.eyebrow')}</p><h2>{t('audit.title')}</h2><p className="muted">{t('audit.description')}</p></div><Button className="refresh" onClick={() => void refresh()} aria-label={t('audit.refresh')}><RefreshCw size={16} /></Button></header>
    <div className="audit-filters">
      <label>{t('audit.action')}<TextField value={action} onChange={(event) => { setAction(event.target.value); setOffset(0) }} placeholder={t('audit.actionPlaceholder')} /></label>
      <label>{t('audit.entityType')}<SelectField value={entityType} onChange={(event) => { setEntityType(event.target.value); setOffset(0) }}><option value="">{t('audit.allEntities')}</option>{['lead','task','handoff','opportunity','activity','invitation','messaging_channel'].map((value) => <option key={value} value={value}>{entityLabel(value)}</option>)}</SelectField></label>
      <label>{t('audit.from')}<CalendarField mode="datetime-local" value={from} onValueChange={(value) => { setFrom(value); setOffset(0) }} /></label>
      <label>{t('audit.to')}<CalendarField mode="datetime-local" value={to} onValueChange={(value) => { setTo(value); setOffset(0) }} /></label>
    </div>
    {error && page?.data.length ? <WorkspaceState kind="error" compact message={t('audit.loadFailed')} detail={t('table.resultsRetained')} /> : null}
    <div className="lead-list-panel">
      <div className="lead-list-toolbar"><div><h3>{t('audit.eventList')}</h3><p>{t('audit.count', { count: page?.pagination.total ?? 0 })}</p></div><ShieldCheck size={18} /></div>
      {loading && page?.data.length ? <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} /> : null}
      {loading && !page ? <WorkspaceState kind="loading" message={t('common.loading')} /> : page?.data.length ? <div className="audit-events">{page.data.map((event) => <article className="audit-event" key={event.id}>
        <span className="audit-event-mark" aria-hidden="true" />
        <div className="audit-event-main"><div className="audit-event-heading"><strong>{event.action}</strong><time dateTime={event.occurredAt}>{dateLabel(event.occurredAt)}</time></div>
          <p>{t('audit.actorEntity', { actor: event.actorName ?? t(`audit.actorTypes.${event.actorType}`, { defaultValue: event.actorType }), entity: entityLabel(event.entityType) })}{event.entityId ? <code>{event.entityId}</code> : null}</p>
          {event.reason && <p className="audit-reason">{event.reason}</p>}{event.correlationId && <p className="audit-correlation"><span>{t('audit.correlationId')}</span><code>{event.correlationId}</code></p>}{stateLabel(event)}
        </div>
      </article>)}</div> : <WorkspaceState kind={error ? 'error' : 'empty'} message={error ? t('audit.loadFailed') : t('audit.empty')} detail={error ? undefined : t('audit.emptyHint')} />}
      <footer className="audit-pagination"><span>{t('table.range', { from: page?.pagination.total ? offset + 1 : 0, to: Math.min(offset + limit, page?.pagination.total ?? 0), total: page?.pagination.total ?? 0 })}</span><label>{t('table.rowsPerPage')}<SelectField value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setOffset(0) }}>{pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</SelectField></label><div><Button type="button" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>{t('table.previous')}</Button><Button type="button" onClick={() => setOffset(offset + limit)} disabled={!page?.pagination.hasNextPage}>{t('table.next')}</Button></div></footer>
    </div>
  </section>
}
