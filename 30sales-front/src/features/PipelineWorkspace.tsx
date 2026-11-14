import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Clock3, History, RefreshCw, Save, TrendingUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type OpportunityDto, type OpportunityHistoryDto, type OpportunityStage } from '../lib/api/client'
import './Pipeline.css'

type PipelineView = 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'
const stages: OpportunityStage[] = ['qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost']
const transitions: Record<OpportunityStage, OpportunityStage[]> = {
  qualification: ['closer_contact_pending', 'lost'], closer_contact_pending: ['discovery_scheduled', 'lost'], discovery_scheduled: ['discovery_done', 'closer_contact_pending', 'lost'],
  discovery_done: ['solution_confirmed', 'proposal_preparing', 'lost'], solution_confirmed: ['proposal_preparing', 'lost'], proposal_preparing: ['proposal_sent', 'lost'],
  proposal_sent: ['negotiation', 'won', 'lost'], negotiation: ['proposal_preparing', 'won', 'lost'], won: [], lost: [],
}
const terminal = (stage: OpportunityStage) => stage === 'won' || stage === 'lost'
function localDateTime(value?: string) {
  const date = value ? new Date(value) : new Date()
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function PipelineWorkspace() {
  const { t, i18n } = useTranslation()
  const [view, setView] = useState<PipelineView>('mine')
  const [opportunities, setOpportunities] = useState<OpportunityDto[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { const page = await api.opportunities.list({ view, limit: 100 }); setOpportunities(page); setHasMore(page.length === 100) }
    catch { setError(t('errors.loadPipeline')) }
    finally { setLoading(false) }
  }, [view, t])
  useEffect(() => { void refresh() }, [refresh])
  const loadMore = async () => {
    setLoadingMore(true); setError('')
    try { const page = await api.opportunities.list({ view, limit: 100, offset: opportunities.length }); setOpportunities((current) => [...current, ...page]); setHasMore(page.length === 100) }
    catch { setError(t('errors.loadPipeline')) }
    finally { setLoadingMore(false) }
  }
  const active = opportunities.filter((item) => !terminal(item.stage))
  const valueByCurrency = active.reduce<Record<string, number>>((totals, item) => { if (item.amount && item.currency) totals[item.currency] = (totals[item.currency] ?? 0) + Number(item.amount); return totals }, {})
  const exposedValue = Object.entries(valueByCurrency).map(([currency, amount]) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)).join(' · ') || '—'
  const atRisk = active.filter((item) => !item.nextActionAt || new Date(item.nextActionAt).getTime() < Date.now() || Date.now() - new Date(item.stageChangedAt).getTime() > 7 * 86400000).length
  const stageCounts = useMemo(() => Object.fromEntries(stages.map((stage) => [stage, opportunities.filter((item) => item.stage === stage).length])) as Record<OpportunityStage, number>, [opportunities])

  return <section className="leads-page pipeline-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('pipeline.eyebrow')}</p><h2>{t('pipeline.title')}</h2><p className="muted">{t('pipeline.description')}</p></div><button className="refresh" onClick={() => void refresh()} aria-label={t('pipeline.refresh')}><RefreshCw size={16} /></button></header>
    <div className="pipeline-metrics"><article><span><TrendingUp size={16} />{t('pipeline.openDeals')}</span><strong>{active.length}</strong></article><article><span><CalendarClock size={16} />{t('pipeline.openValue')}</span><strong>{exposedValue}</strong></article><article className={atRisk ? 'risk' : ''}><span><AlertTriangle size={16} />{t('pipeline.atRisk')}</span><strong>{atRisk}</strong></article></div>
    <div className="pipeline-views" role="tablist" aria-label={t('pipeline.views')}>
      {(['mine', 'all', 'unassigned', 'no_next_action', 'overdue', 'stale'] as const).map((item) => <button key={item} role="tab" aria-selected={view === item} className={view === item ? 'selected' : ''} onClick={() => setView(item)}>{t(`pipeline.viewsList.${item}`)}</button>)}
    </div>
    {error && <p className="error lead-error">{error}</p>}
    {loading ? <div className="lead-empty">{t('common.loading')}</div> : opportunities.length === 0 ? <div className="lead-list-panel lead-empty"><span className="card-icon"><TrendingUp size={19} /></span><h3>{t('pipeline.empty')}</h3><p>{t('pipeline.emptyHint')}</p></div> : <div className="pipeline-board">
      {stages.filter((stage) => stageCounts[stage] > 0 || !terminal(stage)).map((stage) => <section className="pipeline-column" key={stage}>
        <header><h3>{t(`opportunityStages.${stage}`)}</h3><span>{stageCounts[stage]}</span></header>
        {opportunities.filter((item) => item.stage === stage).map((opportunity) => <OpportunityCard key={opportunity.id} opportunity={opportunity} onUpdated={() => void refresh()} />)}
        {stageCounts[stage] === 0 && <p className="pipeline-column-empty">{t('pipeline.noDeals')}</p>}
      </section>)}
    </div>}
    {hasMore && <button className="pipeline-load-more" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? t('common.loading') : t('pipeline.loadMore')}</button>}
    <p className="pipeline-note"><Clock3 size={14} />{t('pipeline.staleRule')}{hasMore ? ` ${t('pipeline.partialMetrics')}` : ''}</p>
  </section>
}

function OpportunityCard({ opportunity, onUpdated }: { opportunity: OpportunityDto; onUpdated: () => void }) {
  const { t, i18n } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [targetStage, setTargetStage] = useState<OpportunityStage>(transitions[opportunity.stage][0] ?? opportunity.stage)
  const [nextAction, setNextAction] = useState(opportunity.nextAction ?? '')
  const [nextActionAt, setNextActionAt] = useState(localDateTime(opportunity.nextActionAt ?? undefined))
  const [amount, setAmount] = useState(opportunity.amount ?? '')
  const [currency, setCurrency] = useState(opportunity.currency ?? 'BRL')
  const [closedAt, setClosedAt] = useState(localDateTime())
  const [lossReason, setLossReason] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<OpportunityHistoryDto[] | null>(null)
  const canMove = transitions[opportunity.stage].length > 0 && opportunity.canUpdate
  const dueAt = opportunity.nextActionAt ? new Date(opportunity.nextActionAt) : null
  const overdue = Boolean(dueAt && dueAt.getTime() < Date.now() && !terminal(opportunity.stage))
  const stale = Date.now() - new Date(opportunity.stageChangedAt).getTime() > 7 * 86400000 && !terminal(opportunity.stage)
  const formatDate = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.opportunities.transition(opportunity.id, {
        expectedStage: opportunity.stage, stage: targetStage, reason: reason.trim() || undefined,
        nextAction: terminal(targetStage) ? undefined : nextAction.trim(), nextActionAt: terminal(targetStage) ? undefined : new Date(nextActionAt).toISOString(),
        amount: targetStage === 'won' ? amount : !terminal(targetStage) && amount ? amount : undefined, currency: targetStage === 'won' || (!terminal(targetStage) && amount) ? currency : undefined,
        closedAt: targetStage === 'won' ? new Date(closedAt).toISOString() : undefined,
        lossReason: targetStage === 'lost' ? lossReason.trim() : undefined,
      })
      setEditing(false); onUpdated()
    } catch { setError(t('errors.updateOpportunity')) }
    finally { setSaving(false) }
  }
  const toggleHistory = async () => {
    if (history !== null) { setHistory(null); return }
    try { setHistory(await api.opportunities.history(opportunity.id)) }
    catch { setError(t('errors.loadOpportunityHistory')) }
  }

  return <article className={`opportunity-card${overdue || !opportunity.nextActionAt ? ' at-risk' : ''}`}>
    <div className="opportunity-card-top"><strong>{opportunity.name}</strong>{stale && <span className="stale-flag">{t('pipeline.stale')}</span>}</div>
    <p className="opportunity-person">{opportunity.contactName} · {opportunity.ownerName ?? t('pipeline.unassignedOwner')}</p>
    {(opportunity.contactEmail || opportunity.contactPhone) && <p className="opportunity-channel">{opportunity.contactEmail ?? opportunity.contactPhone}</p>}
    <div className={`opportunity-next${overdue || !opportunity.nextActionAt ? ' overdue' : ''}`}>
      {opportunity.nextActionAt ? <><CalendarClock size={14} /><span><strong>{opportunity.nextAction ?? t('pipeline.actionMissing')}</strong><small>{formatDate(opportunity.nextActionAt)}</small></span></> : <><AlertTriangle size={14} /><span><strong>{t('pipeline.actionMissing')}</strong><small>{t('pipeline.addNextAction')}</small></span></>}
    </div>
    {opportunity.amount && <p className="opportunity-value">{new Intl.NumberFormat(i18n.language, { style: 'currency', currency: opportunity.currency ?? 'BRL' }).format(Number(opportunity.amount))}</p>}
    {opportunity.lossReason && <p className="opportunity-loss">{t('pipeline.lossReason')}: {opportunity.lossReason}</p>}
    {canMove && <button className="opportunity-edit" onClick={() => { setTargetStage(opportunity.stage); setEditing((value) => !value) }}><TrendingUp size={14} />{t('pipeline.advance')}</button>}
    {editing && <form className="opportunity-transition" onSubmit={submit}>
      <label>{t('pipeline.nextStage')}<select value={targetStage} onChange={(event) => setTargetStage(event.target.value as OpportunityStage)}><option value={opportunity.stage}>{t(`pipeline.keepStage`)} · {t(`opportunityStages.${opportunity.stage}`)}</option>{transitions[opportunity.stage].map((stage) => <option key={stage} value={stage}>{t(`opportunityStages.${stage}`)}</option>)}</select></label>
      {targetStage === 'won' ? <div className="pipeline-conditional"><label>{t('pipeline.amount')}<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label><label>{t('pipeline.currency')}<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} required /></label><label>{t('pipeline.closedAt')}<input type="datetime-local" value={closedAt} onChange={(event) => setClosedAt(event.target.value)} required /></label></div> : targetStage === 'lost' ? <label>{t('pipeline.lossReason')}<textarea value={lossReason} onChange={(event) => setLossReason(event.target.value)} minLength={3} maxLength={1000} required /></label> : <><div className="pipeline-conditional"><label>{t('pipeline.nextAction')}<input value={nextAction} onChange={(event) => setNextAction(event.target.value)} minLength={3} maxLength={500} required /></label><label>{t('pipeline.nextActionAt')}<input type="datetime-local" value={nextActionAt} onChange={(event) => setNextActionAt(event.target.value)} required /></label></div><div className="pipeline-conditional"><label>{t('pipeline.estimatedAmount')}<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></label><label>{t('pipeline.currency')}<input value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} minLength={3} maxLength={3} /></label></div></>}
      <label>{targetStage === opportunity.stage ? t('pipeline.updateReason') : t('pipeline.transitionNote')}<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={targetStage === opportunity.stage ? 3 : undefined} maxLength={1000} required={targetStage === opportunity.stage} /></label>
      {error && <p className="error">{error}</p>}<button className="primary" disabled={saving}>{saving ? t('common.saving') : t('pipeline.saveTransition')}<Save size={14} /></button>
    </form>}
    <button className="opportunity-history-toggle" onClick={() => void toggleHistory()}><History size={13} />{history === null ? t('pipeline.history') : t('pipeline.hideHistory')}</button>
    {history && <ol className="opportunity-history">{history.map((item) => <li key={item.id}><span>{t(`opportunityStages.${item.toStage}`)}</span><small>{item.actorName} · {formatDate(item.occurredAt)}</small>{item.reason && <p>{item.reason}</p>}</li>)}</ol>}
  </article>
}
