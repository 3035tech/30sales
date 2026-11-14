import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Search, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { api, parseLeadStatus, type CreateLeadInput, type LeadDto, type LeadSortBy, type LeadStatus } from '../lib/api/client'
import i18n from '../lib/i18n'

const statusOrder: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']
const sourceOrder: NonNullable<CreateLeadInput['source']>[] = ['manual', 'import', 'whatsapp', 'referral']
type SortDirection = 'asc' | 'desc'

export function LeadsWorkspace() {
  const { t } = useTranslation()
  const [leads, setLeads] = useState<LeadDto[]>([])
  const [total, setTotal] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('')
  const [sourceFilter, setSourceFilter] = useState<NonNullable<CreateLeadInput['source']> | ''>('')
  const [sortBy, setSortBy] = useState<LeadSortBy>('nextActionAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [pageSize, setPageSize] = useState(25)
  const [offset, setOffset] = useState(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<CreateLeadInput>({ accountName: '', contactName: '', email: '', phone: '', source: 'manual' })

  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(query); setOffset(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    api.leads.listPage({ status: statusFilter || undefined, source: sourceFilter || undefined, search: search || undefined, sortBy, sortDirection, limit: pageSize, offset })
      .then((result) => { if (active) { setLeads(result.data); setTotal(result.pagination.total); setHasNextPage(result.pagination.hasNextPage) } })
      .catch(() => { if (active) setError(t('errors.loadLeads')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [statusFilter, sourceFilter, search, sortBy, sortDirection, pageSize, offset, refreshVersion, t])

  const createLead = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.leads.create(form)
      setForm({ accountName: '', contactName: '', email: '', phone: '', source: 'manual' })
      setShowForm(false)
      setOffset(0)
      setRefreshVersion((version) => version + 1)
    } catch { setError(t('errors.saveLead')) }
    finally { setSaving(false) }
  }

  const updateStatus = async (leadId: string, status: LeadStatus) => {
    setError('')
    try {
      await api.leads.updateStatus(leadId, status)
      setRefreshVersion((version) => version + 1)
    } catch { setError(t('errors.updateLead')) }
  }

  const columns: DataTableColumn<LeadDto, LeadSortBy>[] = [
    { id: 'accountName', label: t('leads.companyContact'), render: (lead) => <><strong>{lead.accountName}</strong><small className="lead-contact-name">{lead.contactName}</small></> },
    { id: 'channel', label: t('leads.channel'), render: (lead) => lead.email ?? lead.phone ?? '—' },
    { id: 'source', label: t('leads.source'), render: (lead) => t(`leads.sources.${lead.source}`) },
    { id: 'status', label: t('common.status'), render: (lead) => <select aria-label={t('leads.statusFor', { company: lead.accountName })} className={`status-select status-${lead.status}`} value={lead.status} onChange={(event) => { const status = parseLeadStatus(event.target.value); if (status) void updateStatus(lead.id, status) }}>{statusOrder.map((status) => <option key={status} value={status}>{t(`leadStatuses.${status}`)}</option>)}</select> },
    { id: 'nextActionAt', label: t('leads.nextAction'), render: (lead) => lead.nextActionAt ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(lead.nextActionAt)) : t('leads.noNextAction') },
    { id: 'createdAt', label: t('leads.created'), render: (lead) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(lead.createdAt)) },
  ]

  const filters = <>
    <label className="lead-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('leads.search')} aria-label={t('leads.searchFields')} /></label>
    <label className="lead-filter-label">{t('common.status')}<select value={statusFilter} onChange={(event) => { const value = parseLeadStatus(event.target.value); setStatusFilter(value ?? ''); setOffset(0) }}><option value="">{t('leads.allStatuses')}</option>{statusOrder.map((status) => <option key={status} value={status}>{t(`leadStatuses.${status}`)}</option>)}</select></label>
    <label className="lead-filter-label">{t('leads.source')}<select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value as typeof sourceFilter); setOffset(0) }}><option value="">{t('leads.allSources')}</option>{sourceOrder.map((source) => <option key={source} value={source}>{t(`leads.sources.${source}`)}</option>)}</select></label>
  </>

  const emptyState = search || statusFilter || sourceFilter ? <div><strong>{t('leads.noSearchResults')}</strong><p>{t('leads.noSearchHint')}</p><button className="text-button" onClick={() => { setQuery(''); setSearch(''); setStatusFilter(''); setSourceFilter(''); setOffset(0) }}>{t('leads.clearFilters')}</button></div> : <div><strong>{t('leads.emptyTitle')}</strong><p>{t('leads.emptyHint')}</p><button className="text-button" onClick={() => setShowForm(true)}>{t('leads.addFirstLead')}</button></div>

  return <section className="leads-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('leads.eyebrow')}</p><h2>{t('leads.title')}</h2><p className="muted">{t('leads.description')}</p></div>
      <div className="lead-actions"><button className="refresh" onClick={() => setRefreshVersion((version) => version + 1)} aria-label={t('leads.refresh')}><RefreshCw size={16} /></button><button className="primary add-lead" onClick={() => setShowForm((value) => !value)}><Plus size={16} />{showForm ? t('leads.closeForm') : t('leads.addLead')}</button></div>
    </header>
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
    {error && <p className="error lead-error" role="alert">{error}</p>}
    <div className="lead-list-panel">
      <div className="lead-list-toolbar"><div><h3>{t('leads.queue')}</h3><p>{t('leads.count', { count: total })}</p></div></div>
      <DataTable rows={leads} columns={columns} getRowId={(lead) => lead.id} sort={{ key: sortBy, direction: sortDirection }} onSortChange={(key, direction) => { setSortBy(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit: pageSize, offset, total, hasNextPage }} onPageChange={setOffset} onPageSizeChange={(value) => { setPageSize(value); setOffset(0) }} filters={filters} loading={loading} emptyState={emptyState} />
    </div>
  </section>
}
