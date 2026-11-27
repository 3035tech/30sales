import { Button, CalendarField, IconButton, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowDownLeft, ArrowRight, ArrowUp, Check, ChevronLeft, ChevronRight, RefreshCw, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api, type HandoffDto, type LeadDto } from '../lib/api'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import { notifySystemAlert, SYSTEM_ALERT_KIND } from '../components/ui/SystemAlert'
import './HandoffsWorkspace.css'
import './HandoffReadiness.css'

type HandoffStatus = HandoffDto['status']
const statuses: HandoffStatus[] = ['requested', 'accepted', 'returned']
const readinessFields = ['decisionMaker', 'customerVolume', 'billingProcess', 'primaryNeed'] as const
type ReadinessField = typeof readinessFields[number]
function lines(value: string) { return value.split('\n').map((item) => item.trim()).filter(Boolean) }

export function HandoffsWorkspace() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const handoffId = searchParams.get('handoffId') ?? undefined
  const businessLineId = searchParams.get('businessLineId') ?? undefined
  const [status, setStatus] = useState<HandoffStatus>(() => {
    const requestedStatus = searchParams.get('status')
    const validStatus = statuses.find((candidate) => candidate === requestedStatus)
    return validStatus ?? (handoffId ? 'accepted' : 'requested')
  })
  const [handoffs, setHandoffs] = useState<HandoffDto[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [sortBy, setSortBy] = useState<'requestedAt' | 'accountName' | 'contactName' | 'nextStepAt'>('requestedAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [hasNextPage, setHasNextPage] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [leads, setLeads] = useState<LeadDto[]>([])
  const [leadOptionsState, setLeadOptionsState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [leadId, setLeadId] = useState('')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [confirmedFacts, setConfirmedFacts] = useState('')
  const [unknowns, setUnknowns] = useState('')
  const [readiness, setReadiness] = useState<Record<ReadinessField, string>>({ decisionMaker: '', customerVolume: '', billingProcess: '', primaryNeed: '' })
  const [nextStep, setNextStep] = useState('')
  const [nextStepAt, setNextStepAt] = useState('')
  const [returningId, setReturningId] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const [returnNextStep, setReturnNextStep] = useState('')
  const [returnDueAt, setReturnDueAt] = useState('')
  const [createFormOpen, setCreateFormOpen] = useState(false)
  const requestRevision = useRef(0)

  const refresh = useCallback(async () => {
    const revision = ++requestRevision.current
    setLoading(true); setError('')
    try {
      const page = await api.handoffs.listPage(status, { handoffId, businessLineId, search: debouncedSearch || undefined, sortBy, sortDirection, limit: pageSize, offset })
      if (revision === requestRevision.current) { setHandoffs(page.data); setTotal(page.pagination.total); setHasNextPage(page.pagination.hasNextPage) }
    }
    catch { if (revision === requestRevision.current) setError(t('errors.loadHandoffs')) }
    finally { if (revision === requestRevision.current) setLoading(false) }
  }, [businessLineId, debouncedSearch, handoffId, offset, pageSize, refreshTick, sortBy, sortDirection, status, t])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    const timeout = window.setTimeout(() => { setDebouncedSearch(search.trim()); setOffset(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [search])
  useEffect(() => {
    let active = true
    api.leads.list({ businessLineId, status: 'responded', limit: 100 })
      .then((result) => { if (active) { setLeads(result); setLeadOptionsState('ready') } })
      .catch(() => { if (active) setLeadOptionsState('error') })
    return () => { active = false }
  }, [businessLineId])

  const create = async (event: React.FormEvent) => {
    event.preventDefault()
    const nextStepAtDate = new Date(nextStepAt)
    if (isNaN(nextStepAtDate.getTime())) return
    setSaving(true); setError('')
    try {
      const confirmedReadiness = readinessFields.filter((field) => readiness[field].trim()).map((field) => `${t(`handoffReadiness.fields.${field}`)}: ${readiness[field].trim()}`)
      const missingReadiness = readinessFields.filter((field) => !readiness[field].trim()).map((field) => `${t(`handoffReadiness.fields.${field}`)}: ${t('handoffReadiness.notConfirmed')}`)
      await api.handoffs.create({ leadId, reason: reason.trim(), evidence: evidence.trim(), confirmedFacts: [...confirmedReadiness, ...lines(confirmedFacts)], unknowns: [...missingReadiness, ...lines(unknowns)], nextStep: nextStep.trim(), nextStepAt: nextStepAtDate.toISOString() })
      setReason(''); setEvidence(''); setConfirmedFacts(''); setUnknowns(''); setReadiness({ decisionMaker: '', customerVolume: '', billingProcess: '', primaryNeed: '' }); setNextStep(''); setNextStepAt(''); setLeadId(''); setStatus('requested'); setSearch(''); setDebouncedSearch(''); setOffset(0); setRefreshTick((tick) => tick + 1); setCreateFormOpen(false); if (handoffId) setSearchParams({}); notifySystemAlert(SYSTEM_ALERT_KIND.success, t('handoffs.created'))
    } catch { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('errors.createHandoff')) }
    finally { setSaving(false) }
  }
  const accept = async (handoff: HandoffDto) => {
    setError('')
    try { await api.handoffs.accept(handoff.id); setRefreshTick((tick) => tick + 1) }
    catch { setError(t('errors.acceptHandoff')) }
  }
  const returnHandoff = async (event: React.FormEvent) => {
    event.preventDefault()
    const returnDueAtDate = new Date(returnDueAt)
    if (isNaN(returnDueAtDate.getTime())) return
    setSaving(true); setError('')
    try {
      await api.handoffs.returnToSdr(returningId, { reason: returnReason.trim(), nextStep: returnNextStep.trim(), dueAt: returnDueAtDate.toISOString() })
      setReturningId(''); setReturnReason(''); setReturnNextStep(''); setReturnDueAt(''); setRefreshTick((tick) => tick + 1)
    } catch { setError(t('errors.returnHandoff')) }
    finally { setSaving(false) }
  }
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const elapsed = (start: string, end = new Date().toISOString()) => {
    const minutes = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 60000))
    if (minutes < 60) return new Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(minutes)
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    const formattedHours = new Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'hour', unitDisplay: 'short' }).format(hours)
    return remainingMinutes ? `${formattedHours} ${new Intl.NumberFormat(i18n.language, { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(remainingMinutes)}` : formattedHours
  }

  return <section className="leads-page handoffs-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('handoffs.eyebrow')}</p><h2>{t('handoffs.title')}</h2><p className="muted">{t('handoffs.description')}</p></div><div className="handoff-header-actions"><Button type="button" className="primary" onClick={() => setCreateFormOpen(true)}><Plus size={16} />{t('handoffs.new')}</Button><Button type="button" className="refresh" onClick={() => void refresh()} aria-label={t('handoffs.refresh')}><RefreshCw size={16} /></Button></div></header>
    <Modal open={createFormOpen} onOpenChange={setCreateFormOpen} title={t('handoffs.new')} description={t('handoffs.newHint')} closeLabel={t('common.close')} className="handoff-create-modal">
    <form id="new-handoff-form" className="handoff-form" onSubmit={create}>
      <div className="handoff-fields">
        <label>{t('handoffs.lead')}<SelectField value={leadId} onChange={(event) => setLeadId(event.target.value)} required disabled={leadOptionsState !== 'ready'}><option value="">{t('handoffs.chooseLead')}</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.accountName}{lead.contactName ? ` — ${lead.contactName}` : ''}</option>)}</SelectField>{leadOptionsState === 'loading' && <small aria-live="polite">{t('common.loading')}</small>}{leadOptionsState === 'error' && <small className="ui-field-error" role="alert">{t('handoffs.leadsLoadFailed')}</small>}{leadOptionsState === 'ready' && leads.length === 0 && <small>{t('handoffs.noRespondedLeads')}</small>}{leadOptionsState === 'ready' && leads.length >= 100 && <small>{t('handoffs.leadsCapHint')}</small>}</label>
        <hr className="handoff-divider" aria-hidden="true" />
        <label>{t('handoffs.reason')}<TextField value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={1000} required /></label>
        <label>{t('handoffs.evidence')}<TextareaField value={evidence} onChange={(event) => setEvidence(event.target.value)} minLength={3} maxLength={2000} placeholder={t('handoffs.evidenceHint')} required /></label>
        <hr className="handoff-divider" aria-hidden="true" />
        <label>{t('handoffs.confirmedFacts')}<TextareaField value={confirmedFacts} onChange={(event) => setConfirmedFacts(event.target.value)} placeholder={t('handoffs.listHint')} /></label>
        <label>{t('handoffs.unknowns')}<TextareaField value={unknowns} onChange={(event) => setUnknowns(event.target.value)} placeholder={t('handoffs.listHint')} /></label>
        <div className="handoff-readiness"><div><strong>{t('handoffReadiness.title')}</strong><small>{t('handoffReadiness.hint')}</small></div>{readinessFields.map((field) => <label key={field}>{t(`handoffReadiness.fields.${field}`)}<TextField value={readiness[field]} onChange={(event) => setReadiness((current) => ({ ...current, [field]: event.target.value }))} maxLength={500} placeholder={t('handoffReadiness.placeholder')} /></label>)}</div>
        <hr className="handoff-divider" aria-hidden="true" />
        <label>{t('handoffs.nextStep')}<TextField value={nextStep} onChange={(event) => setNextStep(event.target.value)} minLength={3} maxLength={500} required /></label>
        <label>{t('handoffs.nextStepAt')}<CalendarField mode="datetime-local" value={nextStepAt} onValueChange={(value) => setNextStepAt(value)} required /></label>
        <Button className="primary" disabled={saving || !leads.length}>{saving ? t('common.saving') : t('handoffs.send')}</Button>
      </div>
    </form>
    </Modal>
    {error && handoffs.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    <div className="handoff-tabs" role="tablist" aria-label={t('handoffs.views')}>
      {statuses.map((item) => <Button key={item} role="tab" type="button" aria-selected={status === item} className={status === item ? 'selected' : ''} onClick={() => { setStatus(item); setOffset(0); if (handoffId) setSearchParams({}) }}>{t(`handoffs.status.${item}`)}</Button>)}
    </div>
    <div className="handoff-list-controls">
      <label>{t('handoffs.search')}<TextField type="search" value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0) }} placeholder={t('handoffs.searchHint')} /></label>
      <label>{t('handoffs.sortBy')}<SelectField value={sortBy} onChange={(event) => { setSortBy(event.target.value as typeof sortBy); setOffset(0) }}><option value="requestedAt">{t('handoffs.sort.requestedAt')}</option><option value="accountName">{t('handoffs.sort.accountName')}</option><option value="contactName">{t('handoffs.sort.contactName')}</option><option value="nextStepAt">{t('handoffs.sort.nextStepAt')}</option></SelectField></label>
      <IconButton className="handoff-sort-direction" label={t(sortDirection === 'asc' ? 'handoffs.sortDescending' : 'handoffs.sortAscending')} onClick={() => { setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc'); setOffset(0) }}>{sortDirection === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}</IconButton>
    </div>
    <div className="handoff-list" role="tabpanel" aria-label={t(`handoffs.status.${status}`)}>
      {loading && handoffs.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
      {loading && handoffs.length === 0 ? <WorkspaceState kind="loading" message={t('common.loading')} /> : handoffs.length === 0 ? error ? <WorkspaceState kind="error" message={error} /> : <WorkspaceState kind="empty" message={debouncedSearch ? t('handoffs.noSearchResults') : t('handoffs.empty')} detail={debouncedSearch ? t('handoffs.noSearchResultsHint') : t('handoffs.emptyHint')} /> : handoffs.map((handoff) => <article className="handoff-card" key={handoff.id}>
        <div className="handoff-card-head"><div><span className="eyebrow">{handoff.accountName} · {handoff.contactName ?? t('pipelineWorklist.unknownContact')}</span><h3>{handoff.opportunityName}</h3></div><span className={`handoff-badge handoff-${handoff.status}`}>{t(`handoffs.status.${handoff.status}`)}</span></div>
        <div className="handoff-brief"><div><strong>{t('handoffs.reason')}</strong><p>{handoff.reason}</p></div><div><strong>{t('handoffs.evidence')}</strong><p>{handoff.evidence}</p></div>
          <div><strong>{t('handoffs.confirmedFacts')}</strong>{handoff.confirmedFacts.length ? <ul>{handoff.confirmedFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>{t('handoffs.noneRecorded')}</p>}</div>
          <div><strong>{t('handoffs.unknowns')}</strong>{handoff.unknowns.length ? <ul>{handoff.unknowns.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t('handoffs.noneRecorded')}</p>}</div>
          <div><strong>{t('handoffs.nextStep')}</strong><p>{handoff.nextStep} · {dateLabel(handoff.nextStepAt)}</p></div>
        </div>
        {handoff.acceptedAt && <div className="handoff-response-clock"><strong>{handoff.firstActivityAt ? t('handoffTiming.firstActivity') : t('handoffTiming.waitingForActivity')}</strong><span>{handoff.firstActivityAt ? t('handoffTiming.firstActivityElapsed', { duration: elapsed(handoff.acceptedAt, handoff.firstActivityAt) }) : t('handoffTiming.waitingElapsed', { duration: elapsed(handoff.acceptedAt) })}</span><small>{t('handoffTiming.acceptedAt', { date: dateLabel(handoff.acceptedAt) })}</small></div>}
        <div className="handoff-card-foot"><span>{t('handoffs.requestedBy', { name: handoff.requestedByName })}{handoff.closerName ? ` · ${t('handoffs.closer', { name: handoff.closerName })}` : ''}</span>
          {handoff.status === 'requested' && <IconButton className="handoff-action" label={t('handoffs.accept')} onClick={() => void accept(handoff)}><Check size={17} /></IconButton>}
          {handoff.status === 'accepted' && <IconButton className="handoff-return-trigger" label={t('handoffs.return')} onClick={() => setReturningId(returningId === handoff.id ? '' : handoff.id)}><ArrowDownLeft size={17} /></IconButton>}
        </div>
        {handoff.returnReason && <p className="handoff-return-reason"><strong>{t('handoffs.returnReason')}</strong> {handoff.returnReason}</p>}
        {returningId === handoff.id && <form className="handoff-return-form" onSubmit={returnHandoff}>
          <label>{t('handoffs.returnReason')}<TextareaField value={returnReason} onChange={(event) => setReturnReason(event.target.value)} minLength={3} maxLength={1000} required /></label>
          <label>{t('handoffs.returnAction')}<TextField value={returnNextStep} onChange={(event) => setReturnNextStep(event.target.value)} minLength={3} maxLength={500} required /></label>
          <label>{t('handoffs.returnDueAt')}<CalendarField mode="datetime-local" value={returnDueAt} onValueChange={(value) => setReturnDueAt(value)} required /></label>
          <Button className="primary" disabled={saving}>{saving ? t('common.saving') : t('handoffs.confirmReturn')}<ArrowRight size={15} /></Button>
        </form>}
      </article>)}
    </div>
    <footer className="handoff-pagination"><span>{t('table.range', { from: total ? offset + 1 : 0, to: Math.min(offset + pageSize, total), total })}</span><label>{t('table.rowsPerPage')}<SelectField value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></SelectField></label><div><Button type="button" aria-label={t('table.previous')} onClick={() => setOffset(Math.max(0, offset - pageSize))} disabled={loading || offset === 0}><ChevronLeft size={16} aria-hidden="true" /></Button><Button type="button" aria-label={t('table.next')} onClick={() => setOffset(offset + pageSize)} disabled={loading || !hasNextPage}><ChevronRight size={16} aria-hidden="true" /></Button></div></footer>
  </section>
}
