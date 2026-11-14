import { useCallback, useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowRight, Check, RefreshCw, Send, UserRoundCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type HandoffDto, type LeadDto } from '../lib/api/client'
import './HandoffsWorkspace.css'

type HandoffStatus = HandoffDto['status']
const statuses: HandoffStatus[] = ['requested', 'accepted', 'returned']
function lines(value: string) { return value.split('\n').map((item) => item.trim()).filter(Boolean) }

export function HandoffsWorkspace() {
  const { t, i18n } = useTranslation()
  const [status, setStatus] = useState<HandoffStatus>('requested')
  const [handoffs, setHandoffs] = useState<HandoffDto[]>([])
  const [leads, setLeads] = useState<LeadDto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [leadId, setLeadId] = useState('')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [confirmedFacts, setConfirmedFacts] = useState('')
  const [unknowns, setUnknowns] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [nextStepAt, setNextStepAt] = useState('')
  const [returningId, setReturningId] = useState('')
  const [returnReason, setReturnReason] = useState('')
  const [returnNextStep, setReturnNextStep] = useState('')
  const [returnDueAt, setReturnDueAt] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { setHandoffs(await api.handoffs.list(status)) }
    catch { setError(t('errors.loadHandoffs')) }
    finally { setLoading(false) }
  }, [status, t])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { api.leads.list({ status: 'responded', limit: 100 }).then(setLeads).catch(() => setLeads([])) }, [])

  const create = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.handoffs.create({ leadId, reason: reason.trim(), evidence: evidence.trim(), confirmedFacts: lines(confirmedFacts), unknowns: lines(unknowns), nextStep: nextStep.trim(), nextStepAt: new Date(nextStepAt).toISOString() })
      setReason(''); setEvidence(''); setConfirmedFacts(''); setUnknowns(''); setNextStep(''); setNextStepAt(''); setLeadId(''); await refresh()
    } catch { setError(t('errors.createHandoff')) }
    finally { setSaving(false) }
  }
  const accept = async (handoff: HandoffDto) => {
    setError('')
    try { const updated = await api.handoffs.accept(handoff.id); setHandoffs((items) => items.filter((item) => item.id !== updated.id)) }
    catch { setError(t('errors.acceptHandoff')) }
  }
  const returnHandoff = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const updated = await api.handoffs.returnToSdr(returningId, { reason: returnReason.trim(), nextStep: returnNextStep.trim(), dueAt: new Date(returnDueAt).toISOString() })
      setHandoffs((items) => items.filter((item) => item.id !== updated.id)); setReturningId(''); setReturnReason(''); setReturnNextStep(''); setReturnDueAt('')
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
    <header className="leads-heading"><div><p className="eyebrow">{t('handoffs.eyebrow')}</p><h2>{t('handoffs.title')}</h2><p className="muted">{t('handoffs.description')}</p></div><button className="refresh" onClick={() => void refresh()} aria-label={t('handoffs.refresh')}><RefreshCw size={16} /></button></header>
    <form className="handoff-form" onSubmit={create}>
      <div className="lead-form-title"><Send size={18} /><div><strong>{t('handoffs.new')}</strong><small>{t('handoffs.newHint')}</small></div></div>
      <div className="handoff-fields">
        <label>{t('handoffs.lead')}<select value={leadId} onChange={(event) => setLeadId(event.target.value)} required><option value="">{t('handoffs.chooseLead')}</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.accountName} — {lead.contactName}</option>)}</select></label>
        <label>{t('handoffs.reason')}<input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={1000} required /></label>
        <label>{t('handoffs.evidence')}<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} minLength={3} maxLength={2000} placeholder={t('handoffs.evidenceHint')} required /></label>
        <label>{t('handoffs.confirmedFacts')}<textarea value={confirmedFacts} onChange={(event) => setConfirmedFacts(event.target.value)} placeholder={t('handoffs.listHint')} /></label>
        <label>{t('handoffs.unknowns')}<textarea value={unknowns} onChange={(event) => setUnknowns(event.target.value)} placeholder={t('handoffs.listHint')} /></label>
        <label>{t('handoffs.nextStep')}<input value={nextStep} onChange={(event) => setNextStep(event.target.value)} minLength={3} maxLength={500} required /></label>
        <label>{t('handoffs.nextStepAt')}<input type="datetime-local" value={nextStepAt} onChange={(event) => setNextStepAt(event.target.value)} required /></label>
        <button className="primary" disabled={saving || !leads.length}>{saving ? t('common.saving') : t('handoffs.send')}</button>
      </div>
    </form>
    {error && <p className="error lead-error">{error}</p>}
    <div className="handoff-tabs" role="tablist" aria-label={t('handoffs.views')}>
      {statuses.map((item) => <button key={item} role="tab" aria-selected={status === item} className={status === item ? 'selected' : ''} onClick={() => setStatus(item)}>{t(`handoffs.status.${item}`)}</button>)}
    </div>
    <div className="handoff-list">
      {loading ? <div className="lead-empty">{t('common.loading')}</div> : handoffs.length === 0 ? <div className="lead-empty"><span className="card-icon"><UserRoundCheck size={19} /></span><h3>{t('handoffs.empty')}</h3><p>{t('handoffs.emptyHint')}</p></div> : handoffs.map((handoff) => <article className="handoff-card" key={handoff.id}>
        <div className="handoff-card-head"><div><span className="eyebrow">{handoff.accountName} · {handoff.contactName}</span><h3>{handoff.opportunityName}</h3></div><span className={`handoff-badge handoff-${handoff.status}`}>{t(`handoffs.status.${handoff.status}`)}</span></div>
        <div className="handoff-brief"><div><strong>{t('handoffs.reason')}</strong><p>{handoff.reason}</p></div><div><strong>{t('handoffs.evidence')}</strong><p>{handoff.evidence}</p></div>
          <div><strong>{t('handoffs.confirmedFacts')}</strong>{handoff.confirmedFacts.length ? <ul>{handoff.confirmedFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>{t('handoffs.noneRecorded')}</p>}</div>
          <div><strong>{t('handoffs.unknowns')}</strong>{handoff.unknowns.length ? <ul>{handoff.unknowns.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t('handoffs.noneRecorded')}</p>}</div>
          <div><strong>{t('handoffs.nextStep')}</strong><p>{handoff.nextStep} · {dateLabel(handoff.nextStepAt)}</p></div>
        </div>
        {handoff.acceptedAt && <div className="handoff-response-clock"><strong>{handoff.firstActivityAt ? t('handoffTiming.firstActivity') : t('handoffTiming.waitingForActivity')}</strong><span>{handoff.firstActivityAt ? t('handoffTiming.firstActivityElapsed', { duration: elapsed(handoff.acceptedAt, handoff.firstActivityAt) }) : t('handoffTiming.waitingElapsed', { duration: elapsed(handoff.acceptedAt) })}</span><small>{t('handoffTiming.acceptedAt', { date: dateLabel(handoff.acceptedAt) })}</small></div>}
        <div className="handoff-card-foot"><span>{t('handoffs.requestedBy', { name: handoff.requestedByName })}{handoff.closerName ? ` · ${t('handoffs.closer', { name: handoff.closerName })}` : ''}</span>
          {handoff.status === 'requested' && <button className="primary handoff-action" onClick={() => void accept(handoff)}><Check size={15} />{t('handoffs.accept')}</button>}
          {handoff.status === 'accepted' && <button className="handoff-return-trigger" onClick={() => setReturningId(returningId === handoff.id ? '' : handoff.id)}><ArrowDownLeft size={15} />{t('handoffs.return')}</button>}
        </div>
        {handoff.returnReason && <p className="handoff-return-reason"><strong>{t('handoffs.returnReason')}</strong> {handoff.returnReason}</p>}
        {returningId === handoff.id && <form className="handoff-return-form" onSubmit={returnHandoff}>
          <label>{t('handoffs.returnReason')}<textarea value={returnReason} onChange={(event) => setReturnReason(event.target.value)} minLength={3} maxLength={1000} required /></label>
          <label>{t('handoffs.returnAction')}<input value={returnNextStep} onChange={(event) => setReturnNextStep(event.target.value)} minLength={3} maxLength={500} required /></label>
          <label>{t('handoffs.returnDueAt')}<input type="datetime-local" value={returnDueAt} onChange={(event) => setReturnDueAt(event.target.value)} required /></label>
          <button className="primary" disabled={saving}>{saving ? t('common.saving') : t('handoffs.confirmReturn')}<ArrowRight size={15} /></button>
        </form>}
      </article>)}
    </div>
  </section>
}
