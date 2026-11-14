import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, Plus, RefreshCw, Search, Users } from 'lucide-react'
import { api, parseLeadStatus, type CreateLeadInput, type LeadDto, type LeadStatus } from '../lib/api/client'
import i18n from '../lib/i18n'

const statusOrder: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']
const statusSummary: LeadStatus[] = ['new', 'researching', 'queued', 'contacting', 'responded', 'converted_to_sdr']

export function LeadsWorkspace() {
  const { t } = useTranslation()
  const [leads, setLeads] = useState<LeadDto[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateLeadInput>({ accountName: '', contactName: '', email: '', phone: '', source: 'manual' })

  const refresh = async () => {
    setLoading(true)
    setError('')
    try { setLeads(await api.leads.list({ limit: 100 })) }
    catch { setError(t('errors.loadLeads')) }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [])

  const createLead = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const created = await api.leads.create(form)
      setLeads((current) => [created, ...current])
      setForm({ accountName: '', contactName: '', email: '', phone: '', source: 'manual' })
      setShowForm(false)
    } catch { setError(t('errors.saveLead')) }
    finally { setSaving(false) }
  }

  const updateStatus = async (leadId: string, status: LeadStatus) => {
    setError('')
    try {
      const changed = await api.leads.updateStatus(leadId, status)
      setLeads((current) => current.map((lead) => lead.id === changed.id ? changed : lead))
    } catch { setError(t('errors.updateLead')) }
  }

  const normalizedQuery = query.toLocaleLowerCase(i18n.language)
  const filteredLeads = leads.filter((lead) => `${lead.accountName} ${lead.contactName} ${lead.email ?? ''} ${lead.phone ?? ''}`.toLocaleLowerCase(i18n.language).includes(normalizedQuery))
  const countFor = (status: LeadStatus) => leads.filter((lead) => lead.status === status).length

  return <section className="leads-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('leads.eyebrow')}</p><h2>{t('leads.title')}</h2><p className="muted">{t('leads.description')}</p></div>
      <div className="lead-actions"><button className="refresh" onClick={() => void refresh()} aria-label={t('leads.refresh')}><RefreshCw size={16} /></button><button className="primary add-lead" onClick={() => setShowForm((value) => !value)}><Plus size={16} />{showForm ? t('leads.closeForm') : t('leads.addLead')}</button></div>
    </header>
    <div className="lead-stats">{statusSummary.map((status) => <div className="lead-stat" key={status}><span>{t(`leadStatuses.${status}`)}</span><strong>{countFor(status)}</strong></div>)}</div>
    {showForm && <form className="lead-form" onSubmit={createLead}>
      <div className="lead-form-title"><Users size={18} /><div><strong>{t('leads.newLead')}</strong><small>{t('leads.newLeadHint')}</small></div></div>
      <div className="lead-fields">
        <label>{t('leads.company')}<input value={form.accountName} onChange={(event) => setForm({ ...form, accountName: event.target.value })} minLength={2} maxLength={160} required /></label>
        <label>{t('leads.contactName')}<input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} minLength={2} maxLength={160} required /></label>
        <label>{t('common.email')}<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>{t('common.phone')}<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
      </div>
      <p className="form-hint">{t('leads.contactChannelHint')}</p><button className="primary" disabled={saving}>{saving ? t('common.saving') : t('leads.saveLead')}</button>
    </form>}
    {error && <p className="error lead-error">{error}</p>}
    <div className="lead-list-panel">
      <div className="lead-list-toolbar"><div><h3>{t('leads.queue')}</h3><p>{t('leads.count', { count: filteredLeads.length })}</p></div>
        <label className="lead-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('leads.search')} /></label><span className="queue-sort"><ArrowDownUp size={14} />{t('leads.nextAction')}</span>
      </div>
      {loading ? <div className="lead-empty">{t('common.loading')}</div> : filteredLeads.length === 0 ? <div className="lead-empty"><span className="card-icon"><Users size={19} /></span><h3>{query ? t('leads.noSearchResults') : t('leads.emptyTitle')}</h3><p>{query ? t('leads.noSearchHint') : t('leads.emptyHint')}</p>{!query && <button className="text-button" onClick={() => setShowForm(true)}>{t('leads.addFirstLead')}</button>}</div>
        : <div className="lead-table-wrap"><table className="lead-table"><thead><tr><th>{t('leads.companyContact')}</th><th>{t('leads.channel')}</th><th>{t('leads.source')}</th><th>{t('common.status')}</th><th>{t('leads.created')}</th></tr></thead>
          <tbody>{filteredLeads.map((lead) => <tr key={lead.id}><td><strong>{lead.accountName}</strong><small>{lead.contactName}</small></td><td>{lead.email ?? lead.phone ?? '—'}</td><td>{t(`leads.sources.${lead.source}`)}</td>
            <td><select aria-label={t('leads.statusFor', { company: lead.accountName })} className={`status-select status-${lead.status}`} value={lead.status} onChange={(event) => { const status = parseLeadStatus(event.target.value); if (status) void updateStatus(lead.id, status) }}>{statusOrder.map((status) => <option key={status} value={status}>{t(`leadStatuses.${status}`)}</option>)}</select></td>
            <td>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(lead.createdAt))}</td></tr>)}</tbody>
        </table></div>}
    </div>
  </section>
}
