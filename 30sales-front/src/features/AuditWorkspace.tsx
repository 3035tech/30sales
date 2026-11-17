import { Button, CalendarField, SelectField, TextField } from '../components/ui/FormControls'
import { useCallback, useEffect, useState } from 'react'
import { Eye, RefreshCw, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { Modal } from '../components/ui/Modal'
import { api, type AuditEventDto, type AuditEventsPageDto } from '../lib/api'
import './AuditWorkspace.css'
import './AuditTable.css'

type AuditSortKey = 'occurredAt' | 'action' | 'actorName' | 'entityType' | 'reason'

export function AuditWorkspace() {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState<AuditEventsPageDto | null>(null)
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [sortBy, setSortBy] = useState<AuditSortKey>('occurredAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<AuditEventDto | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      setPage(await api.audit.list({ action: action.trim() || undefined, entityType: entityType || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(to).toISOString() : undefined, sortBy, sortDirection, limit, offset }))
    } catch { setError(true) }
    finally { setLoading(false) }
  }, [action, entityType, from, to, sortBy, sortDirection, limit, offset])

  useEffect(() => { void refresh() }, [refresh])
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const entityLabel = (value: string) => value === 'messaging_channel' ? t('channels.columns.name') : t(`audit.entities.${value}`, { defaultValue: value })
  const actionLabel = (value: string) => t(`audit.actions.${value}`, { defaultValue: value })
  const formatState = (value: unknown) => value == null ? '—' : JSON.stringify(value, null, 2) ?? '—'
  const changeDetails = (event: AuditEventDto) => event.beforeState !== null || event.afterState !== null
    ? <Button className="audit-view-change" type="button" onClick={() => setSelectedEvent(event)} aria-label={t('audit.viewChange')}><Eye size={15} />{t('audit.viewChange')}</Button>
    : null
  const columns: DataTableColumn<AuditEventDto, AuditSortKey>[] = [
    { id: 'occurredAt', label: t('audit.columns.occurredAt'), render: (event) => <time className="audit-date" dateTime={event.occurredAt}>{dateLabel(event.occurredAt)}</time> },
    { id: 'action', label: t('audit.columns.action'), render: (event) => <strong className="audit-action">{actionLabel(event.action)}</strong> },
    { id: 'actorName', label: t('audit.columns.actor'), render: (event) => <span className="audit-actor">{event.actorName ?? t(`audit.actorTypes.${event.actorType}`, { defaultValue: event.actorType })}</span> },
    { id: 'entityType', label: t('audit.columns.record'), render: (event) => <span className="audit-record"><strong>{entityLabel(event.entityType)}</strong>{event.entityId && <code>{event.entityId}</code>}</span> },
    { id: 'reason', label: t('audit.columns.details'), render: (event) => <div className="audit-details">{event.reason && <p className="audit-reason">{event.reason}</p>}{event.correlationId && <p className="audit-correlation"><span>{t('audit.correlationId')}</span><code>{event.correlationId}</code></p>}{changeDetails(event)}</div> },
  ]
  const emptyState = <div><strong>{error ? t('audit.loadFailed') : t('audit.empty')}</strong>{!error && <p>{t('audit.emptyHint')}</p>}</div>

  return <section className="leads-page audit-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('audit.eyebrow')}</p><h2>{t('audit.title')}</h2><p className="muted">{t('audit.description')}</p></div><Button className="refresh" onClick={() => void refresh()} aria-label={t('audit.refresh')}><RefreshCw size={16} /></Button></header>
    <div className="audit-filters">
      <label>{t('audit.action')}<TextField value={action} onChange={(event) => { setAction(event.target.value); setOffset(0) }} placeholder={t('audit.actionPlaceholder')} /></label>
      <label>{t('audit.entityType')}<SelectField value={entityType} onChange={(event) => { setEntityType(event.target.value); setOffset(0) }}><option value="">{t('audit.allEntities')}</option>{['lead','task','handoff','opportunity','activity','invitation','messaging_channel','platform_access'].map((value) => <option key={value} value={value}>{entityLabel(value)}</option>)}</SelectField></label>
      <label>{t('audit.from')}<CalendarField mode="datetime-local" value={from} onValueChange={(value) => { setFrom(value); setOffset(0) }} /></label>
      <label>{t('audit.to')}<CalendarField mode="datetime-local" value={to} onValueChange={(value) => { setTo(value); setOffset(0) }} /></label>
    </div>
    {error && page?.data.length ? <WorkspaceState kind="error" compact message={t('audit.loadFailed')} detail={t('table.resultsRetained')} /> : null}
    <div className="lead-list-panel">
      <div className="lead-list-toolbar"><div><h3>{t('audit.eventList')}</h3><p>{t('audit.count', { count: page?.pagination.total ?? 0 })}</p></div><ShieldCheck size={18} /></div>
      <DataTable rows={page?.data ?? []} columns={columns} getRowId={(event) => event.id} sort={{ key: sortBy, direction: sortDirection }} onSortChange={(key, direction) => { setSortBy(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit, offset, total: page?.pagination.total ?? 0, hasNextPage: page?.pagination.hasNextPage ?? false }} onPageChange={setOffset} onPageSizeChange={(size) => { setLimit(size); setOffset(0) }} loading={loading} emptyState={emptyState} emptyStateKind={error ? 'error' : 'empty'} />
    </div>
    <Modal open={selectedEvent !== null} onOpenChange={(open) => { if (!open) setSelectedEvent(null) }} title={t('audit.changeDetails')} description={selectedEvent ? `${entityLabel(selectedEvent.entityType)} · ${actionLabel(selectedEvent.action)} · ${dateLabel(selectedEvent.occurredAt)}` : undefined} closeLabel={t('audit.closeDetails')} className="audit-modal">
          {selectedEvent && <div className="audit-modal-content">
            {selectedEvent.reason && <p className="audit-modal-reason">{selectedEvent.reason}</p>}
            <div className="audit-change-columns">
              <section><h3>{t('audit.before')}</h3><pre>{formatState(selectedEvent.beforeState)}</pre></section>
              <section><h3>{t('audit.after')}</h3><pre>{formatState(selectedEvent.afterState)}</pre></section>
            </div>
            {selectedEvent.correlationId && <p className="audit-modal-correlation"><strong>{t('audit.correlationId')}</strong><code>{selectedEvent.correlationId}</code></p>}
          </div>}
    </Modal>
  </section>
}
