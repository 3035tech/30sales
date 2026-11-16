import { Button, CheckboxField, IconButton, NumericField, PhoneField, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { useEffect, useState } from 'react'
import { Plus, RefreshCw, Search, Star, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import { ACCOUNT_SEGMENT_FILTER, api, ApiError, parseLeadStatus, type AccountSegmentDto, type CreateLeadContactInput, type CreateLeadInput, type LeadAssigneeDto, type LeadContactDto, type LeadDto, type LeadDuplicateCandidateDto, type LeadSortBy, type LeadStatus } from '../lib/api/client'
import { ACCOUNT_MARKET_FILTER, ACCOUNT_MARKET_SEGMENTS } from '../lib/accountConstants'
import i18n from '../lib/i18n'
import './LeadsWorkspace.css'
import './LeadDuplicateReview.css'
import './LeadProfile.css'

const statusOrder: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']
const sourceOrder: NonNullable<CreateLeadInput['source']>[] = ['manual', 'import', 'whatsapp', 'referral']
type SortDirection = 'asc' | 'desc'

export function LeadsWorkspace({ initialSearch = '' }: { initialSearch?: string }) {
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
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [segmentFilter, setSegmentFilter] = useState('')
  const [marketFilter, setMarketFilter] = useState<string>(ACCOUNT_MARKET_FILTER.all)
  const [studentCountMin, setStudentCountMin] = useState<number | null>(null)
  const [studentCountMax, setStudentCountMax] = useState<number | null>(null)
  const [assignees, setAssignees] = useState<LeadAssigneeDto[] | null>(null)
  const [segments, setSegments] = useState<AccountSegmentDto[]>([])
  const [sortBy, setSortBy] = useState<LeadSortBy>('nextActionAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [pageSize, setPageSize] = useState(25)
  const [offset, setOffset] = useState(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [statusUpdate, setStatusUpdate] = useState<{ lead: LeadDto; status: LeadStatus } | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [form, setForm] = useState<CreateLeadInput>({ accountName: '', contactName: '', email: '', phone: '', source: 'manual' })
  const [duplicateCandidates, setDuplicateCandidates] = useState<LeadDuplicateCandidateDto[] | null>(null)
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('')
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [contactsLead, setContactsLead] = useState<LeadDto | null>(null)
  const [leadContacts, setLeadContacts] = useState<LeadContactDto[]>([])
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsSaving, setContactsSaving] = useState(false)
  const [contactsError, setContactsError] = useState('')
  const [contactForm, setContactForm] = useState<CreateLeadContactInput>({ name: '', email: '', phone: '', jobTitle: '', isInterested: false, referralNote: '', notes: '' })
  const studentRangeInvalid = studentCountMin !== null && studentCountMax !== null && studentCountMin > studentCountMax

  useEffect(() => { if (initialSearch) { setQuery(initialSearch); setSearch(initialSearch); setOffset(0) } }, [initialSearch])

  useEffect(() => {
    const timeout = window.setTimeout(() => { setSearch(query); setOffset(0) }, 250)
    return () => window.clearTimeout(timeout)
  }, [query])

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    if (studentRangeInvalid) { setLeads([]); setTotal(0); setHasNextPage(false); setLoading(false); return () => { active = false } }
    api.leads.listPage({ status: statusFilter || undefined, source: sourceFilter || undefined, assignedToUserId: assigneeFilter || undefined, segmentId: segmentFilter || undefined, marketSegment: ACCOUNT_MARKET_SEGMENTS.find((segment) => segment === marketFilter), withoutMarketSegment: marketFilter === ACCOUNT_MARKET_FILTER.unclassified || undefined, studentCountMin: studentCountMin ?? undefined, studentCountMax: studentCountMax ?? undefined, search: search || undefined, sortBy, sortDirection, limit: pageSize, offset })
      .then((result) => { if (active) { setLeads(result.data); setTotal(result.pagination.total); setHasNextPage(result.pagination.hasNextPage) } })
      .catch(() => { if (active) setError(t('errors.loadLeads')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [statusFilter, sourceFilter, assigneeFilter, segmentFilter, marketFilter, studentCountMin, studentCountMax, studentRangeInvalid, search, sortBy, sortDirection, pageSize, offset, refreshVersion, t])

  useEffect(() => { api.leads.assignees().then(setAssignees).catch(() => setAssignees(null)) }, [])
  useEffect(() => { api.accounts.segments().then(setSegments).catch(() => setSegments([])) }, [])

  const updateLeadForm = (update: Partial<CreateLeadInput>) => {
    setForm((current) => ({ ...current, ...update }))
    setDuplicateCandidates(null)
    setDuplicateOverrideReason('')
  }

  const saveLead = async (overrideReason?: string) => {
    setSaving(true)
    setError('')
    try {
      await api.leads.create({ ...form, duplicateOverrideReason: overrideReason })
      setForm({ accountName: '', contactName: '', email: '', phone: '', source: 'manual' })
      setDuplicateCandidates(null)
      setDuplicateOverrideReason('')
      setShowForm(false)
      setOffset(0)
      setRefreshVersion((version) => version + 1)
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'LEAD_POSSIBLE_DUPLICATES') {
        try { const result = await api.leads.checkDuplicates(form); if (result.candidates.length) { setDuplicateCandidates(result.candidates); setError('') } else setError(t('errors.saveLead')) }
        catch { setError(t('leadDuplicateReview.checkFailed')) }
      } else setError(t('errors.saveLead'))
    }
    finally { setSaving(false) }
  }

  const createLead = async (event: React.FormEvent) => {
    event.preventDefault()
    setCheckingDuplicates(true)
    setError('')
    try {
      const result = await api.leads.checkDuplicates(form)
      if (result.candidates.length) { setDuplicateCandidates(result.candidates); setDuplicateOverrideReason(''); return }
      await saveLead()
    } catch { setError(t('leadDuplicateReview.checkFailed')) }
    finally { setCheckingDuplicates(false) }
  }

  const updateStatus = async (leadId: string, status: LeadStatus, reason: string) => {
    setError('')
    setStatusSaving(true)
    try {
      await api.leads.updateStatus(leadId, status, reason)
      setStatusUpdate(null)
      setStatusReason('')
      setRefreshVersion((version) => version + 1)
    } catch { setError(t('errors.updateLead')) }
    finally { setStatusSaving(false) }
  }
  const assignLead = async (lead: LeadDto, userId: string) => {
    setError('')
    try { await api.leads.assign(lead.id, userId || null); setRefreshVersion((version) => version + 1) }
    catch { setError(t('leadAssignment.saveFailed')) }
  }
  const openContacts = async (lead: LeadDto) => {
    setContactsLead(lead)
    setLeadContacts([])
    setContactsError('')
    setContactsLoading(true)
    try { setLeadContacts(await api.leads.contacts(lead.id)) }
    catch { setContactsError(t('leadContacts.loadFailed')) }
    finally { setContactsLoading(false) }
  }
  const saveContact = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!contactsLead) return
    setContactsSaving(true)
    setContactsError('')
    try {
      await api.leads.addContact(contactsLead.id, contactForm)
      setLeadContacts(await api.leads.contacts(contactsLead.id))
      setContactForm({ name: '', email: '', phone: '', jobTitle: '', isInterested: false, referralNote: '', notes: '' })
      setRefreshVersion((version) => version + 1)
    } catch (caught) {
      setContactsError(caught instanceof ApiError && caught.code === 'LEAD_CONTACT_ALREADY_EXISTS' ? t('leadContacts.duplicate') : t('leadContacts.saveFailed'))
    } finally { setContactsSaving(false) }
  }
  const updateContactInterest = async (contact: LeadContactDto, isInterested: boolean) => {
    if (!contactsLead) return
    setContactsError('')
    try {
      const updated = await api.leads.updateContact(contactsLead.id, contact.id, isInterested)
      setLeadContacts((current) => current.map((item) => item.id === updated.id ? { ...item, isInterested: updated.isInterested } : item))
    } catch { setContactsError(t('leadContacts.updateFailed')) }
  }
  const makePrimaryContact = async (contact: LeadContactDto) => {
    if (!contactsLead) return
    setContactsError('')
    try {
      const updated = await api.leads.setPrimaryContact(contactsLead.id, contact.id)
      setLeadContacts((current) => current.map((item) => ({ ...item, isPrimary: item.id === updated.id })))
      setRefreshVersion((version) => version + 1)
    } catch { setContactsError(t('leadContacts.updateFailed')) }
  }

  const columns: DataTableColumn<LeadDto, LeadSortBy>[] = [
    { id: 'accountName', label: t('leads.companyContact'), render: (lead) => <><strong>{lead.accountName}</strong><small className="lead-account-profile">{lead.accountMarketSegment ? t(`accountProfileFields.marketSegments.${lead.accountMarketSegment}`) : t('accountProfileFields.unclassifiedMarketSegment')}{lead.accountStudentCount !== null && <span>{t('accountProfileFields.studentsShort', { count: new Intl.NumberFormat(i18n.language).format(lead.accountStudentCount) })}</span>}</small><span className="lead-primary-contact"><small className="lead-contact-name">{lead.contactName || t('leadContacts.noPrimary')}</small><IconButton label={t('leadContacts.manage')} onClick={() => void openContacts(lead)}><Users size={15} /></IconButton></span></> },
    { id: 'channel', label: t('leads.channel'), render: (lead) => lead.email ?? lead.phone ?? '—' },
    { id: 'source', label: t('leads.source'), render: (lead) => t(`leads.sources.${lead.source}`) },
    { id: 'segment', label: t('accounts.columns.segment'), render: (lead) => lead.accountSegmentName ?? t('accounts.unsegmented') },
    { id: 'status', label: t('common.status'), render: (lead) => <SelectField aria-label={t('leads.statusFor', { company: lead.accountName })} className={`status-select status-${lead.status}`} value={lead.status} onChange={(event) => { const status = parseLeadStatus(event.target.value); if (status && status !== lead.status) { setStatusUpdate({ lead, status }); setStatusReason('') } }}>{statusOrder.map((status) => <option key={status} value={status}>{t(`leadStatuses.${status}`)}</option>)}</SelectField> },
    { id: 'assignedTo', label: t('leadAssignment.assignee'), render: (lead) => assignees ? <SelectField aria-label={t('leadAssignment.assigneeFor', { company: lead.accountName })} className="lead-assignee-select" value={lead.assignedToUserId ?? ''} onChange={(event) => void assignLead(lead, event.target.value)}><option value="">{t('leadAssignment.unassigned')}</option>{lead.assignedToUserId && !assignees.some((member) => member.id === lead.assignedToUserId) && <option value={lead.assignedToUserId}>{lead.assignedToName ?? t('leadAssignment.unknownAssignee')}</option>}{assignees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</SelectField> : lead.assignedToName ?? t('leadAssignment.unassigned') },
    { id: 'nextActionAt', label: t('leads.nextAction'), render: (lead) => lead.nextActionAt ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(lead.nextActionAt)) : t('leads.noNextAction') },
    { id: 'createdAt', label: t('leads.created'), render: (lead) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(lead.createdAt)) },
  ]

  const filters = <>
    <label className="lead-search"><Search size={15} /><TextField value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('leads.search')} aria-label={t('leads.searchFields')} /></label>
    <label className="lead-filter-label">{t('common.status')}<SelectField value={statusFilter} onChange={(event) => { const value = parseLeadStatus(event.target.value); setStatusFilter(value ?? ''); setOffset(0) }}><option value="">{t('leads.allStatuses')}</option>{statusOrder.map((status) => <option key={status} value={status}>{t(`leadStatuses.${status}`)}</option>)}</SelectField></label>
    <label className="lead-filter-label">{t('leads.source')}<SelectField value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value as typeof sourceFilter); setOffset(0) }}><option value="">{t('leads.allSources')}</option>{sourceOrder.map((source) => <option key={source} value={source}>{t(`leads.sources.${source}`)}</option>)}</SelectField></label>
    <label className="lead-filter-label">{t('accounts.columns.segment')}<SelectField value={segmentFilter} onChange={(event) => { setSegmentFilter(event.target.value); setOffset(0) }}><option value="">{t('accounts.allSegments')}</option><option value={ACCOUNT_SEGMENT_FILTER.unassigned}>{t('accounts.unsegmented')}</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</SelectField></label>
    <label className="lead-filter-label">{t('accountProfileFields.marketSegment')}<SelectField value={marketFilter} onChange={(event) => { setMarketFilter(event.target.value); setOffset(0) }}><option value={ACCOUNT_MARKET_FILTER.all}>{t('accountProfileFields.allMarketSegments')}</option><option value={ACCOUNT_MARKET_FILTER.unclassified}>{t('accountProfileFields.unclassifiedMarketSegment')}</option>{ACCOUNT_MARKET_SEGMENTS.map((segment) => <option key={segment} value={segment}>{t(`accountProfileFields.marketSegments.${segment}`)}</option>)}</SelectField></label>
    <label className="lead-filter-label">{t('accountProfileFields.minStudents')}<NumericField mode="integer" min={0} max={10000000} value={studentCountMin} onValueChange={(value) => { setStudentCountMin(value); setOffset(0) }} /></label>
    <label className="lead-filter-label">{t('accountProfileFields.maxStudents')}<NumericField mode="integer" min={0} max={10000000} value={studentCountMax} onValueChange={(value) => { setStudentCountMax(value); setOffset(0) }} /></label>
    {studentRangeInvalid && <small className="lead-filter-error" role="alert">{t('accountProfileFields.invalidStudentRange')}</small>}
    {assignees && <label className="lead-filter-label">{t('leadAssignment.assignee')}<SelectField value={assigneeFilter} onChange={(event) => { setAssigneeFilter(event.target.value); setOffset(0) }}><option value="">{t('leadAssignment.allAssignees')}</option><option value="unassigned">{t('leadAssignment.unassigned')}</option>{assignees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</SelectField></label>}
  </>

  const emptyState = error ? <div><strong>{error}</strong></div> : search || statusFilter || sourceFilter || assigneeFilter || segmentFilter || marketFilter !== ACCOUNT_MARKET_FILTER.all || studentCountMin !== null || studentCountMax !== null ? <div><strong>{t('leads.noSearchResults')}</strong><p>{t('leads.noSearchHint')}</p><Button className="text-button" onClick={() => { setQuery(''); setSearch(''); setStatusFilter(''); setSourceFilter(''); setAssigneeFilter(''); setSegmentFilter(''); setMarketFilter(ACCOUNT_MARKET_FILTER.all); setStudentCountMin(null); setStudentCountMax(null); setOffset(0) }}>{t('leads.clearFilters')}</Button></div> : <div><strong>{t('leads.emptyTitle')}</strong><p>{t('leads.emptyHint')}</p><Button className="text-button" onClick={() => setShowForm(true)}>{t('leads.addFirstLead')}</Button></div>

  return <section className="leads-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('leads.eyebrow')}</p><h2>{t('leads.title')}</h2><p className="muted">{t('leads.description')}</p></div>
      <div className="lead-actions"><Button className="refresh" onClick={() => setRefreshVersion((version) => version + 1)} aria-label={t('leads.refresh')}><RefreshCw size={16} /></Button><Button className="primary add-lead" onClick={() => setShowForm((value) => !value)}><Plus size={16} />{showForm ? t('leads.closeForm') : t('leads.addLead')}</Button></div>
    </header>
    {showForm && <form className="lead-form" onSubmit={createLead}>
      <div className="lead-form-title"><Users size={18} /><div><strong>{t('leads.newLead')}</strong><small>{t('leads.newLeadHint')}</small></div></div>
      <div className="lead-fields">
        <label>{t('leads.company')}<TextField value={form.accountName} onChange={(event) => updateLeadForm({ accountName: event.target.value })} minLength={2} maxLength={160} required /></label>
        <label>{t('leads.contactName')}<TextField value={form.contactName ?? ''} onChange={(event) => updateLeadForm({ contactName: event.target.value })} minLength={2} maxLength={160} /></label>
        <label>{t('common.email')}<TextField type="email" normalize="email" value={form.email ?? ''} onChange={(event) => updateLeadForm({ email: event.target.value })} /></label>
        <label>{t('common.phone')}<PhoneField value={form.phone ?? ''} onValueChange={(phone) => updateLeadForm({ phone })} /></label>
      </div>
      <p className="form-hint">{t('leads.contactChannelHint')}</p>
      {duplicateCandidates && <section className="lead-duplicate-review" aria-live="polite"><div><strong>{t('leadDuplicateReview.title')}</strong><p>{t('leadDuplicateReview.hint')}</p></div><ul>{duplicateCandidates.map((candidate) => <li key={candidate.id}><span><strong>{candidate.accountName}{candidate.contactName ? ` · ${candidate.contactName}` : ''}</strong><small>{t(`leadStatuses.${candidate.status}`)} · {candidate.matchedBy.map((match) => t(`leadDuplicateReview.matchedBy.${match}`)).join(', ')}</small></span></li>)}</ul><label>{t('leadDuplicateReview.overrideReason')}<TextareaField value={duplicateOverrideReason} onChange={(event) => setDuplicateOverrideReason(event.target.value)} minLength={3} maxLength={500} required /></label><div className="lead-duplicate-actions"><Button type="button" className="status-change-cancel" disabled={saving} onClick={() => { setDuplicateCandidates(null); setDuplicateOverrideReason('') }}>{t('common.cancel')}</Button><Button type="button" className="primary" disabled={saving || duplicateOverrideReason.trim().length < 3} onClick={() => void saveLead(duplicateOverrideReason.trim())}>{saving ? t('common.saving') : t('leadDuplicateReview.createAnyway')}</Button></div></section>}
      {!duplicateCandidates && <Button className="primary" disabled={saving || checkingDuplicates}>{checkingDuplicates ? t('leadDuplicateReview.checking') : saving ? t('common.saving') : t('leads.saveLead')}</Button>}
    </form>}
    <Modal open={contactsLead !== null} onOpenChange={(open) => { if (!open) { setContactsLead(null); setContactsError(''); setContactForm({ name: '', email: '', phone: '', jobTitle: '', isInterested: false, referralNote: '', notes: '' }) } }} title={t('leadContacts.title', { company: contactsLead?.accountName ?? '' })} description={t('leadContacts.description')} closeLabel={t('common.close')} className="lead-contacts-modal">
      {contactsError && <WorkspaceState kind="error" compact message={contactsError} />}
      {contactsLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : <>
        <section className="lead-contacts-list" aria-label={t('leadContacts.listLabel')}>
          {leadContacts.length === 0 ? <WorkspaceState kind="empty" message={t('leadContacts.empty')} /> : leadContacts.map((contact) => <article className="lead-contact-card" key={contact.id}>
            <div className="lead-contact-card-heading"><div><strong>{contact.name}</strong>{contact.jobTitle && <span>{contact.jobTitle}</span>}</div>{contact.isPrimary && <span className="lead-contact-primary"><Star size={14} fill="currentColor" />{t('leadContacts.primary')}</span>}</div>
            <div className="lead-contact-card-details">{contact.email && <span>{contact.email}</span>}{contact.phone && <span>{contact.phone}</span>}{!contact.email && !contact.phone && <span>{t('leadContacts.noChannel')}</span>}</div>
            {contact.referralNote && <p><strong>{t('leadContacts.referral')}:</strong> {contact.referralNote}</p>}
            {contact.notes && <p>{contact.notes}</p>}
            <div className="lead-contact-card-actions">
              <label><CheckboxField checked={contact.isInterested} onChange={(event) => void updateContactInterest(contact, event.target.checked)} />{t('leadContacts.interested')}</label>
              {contact.hasConversation && <span className="lead-contact-conversation">{t('leadContacts.inConversation')}</span>}
              {!contact.isPrimary && <Button type="button" onClick={() => void makePrimaryContact(contact)}>{t('leadContacts.makePrimary')}</Button>}
            </div>
          </article>)}
        </section>
        <form className="lead-contact-form" onSubmit={saveContact}>
          <h3>{t('leadContacts.add')}</h3>
          <div className="lead-contact-fields">
            <label>{t('leadContacts.name')}<TextField value={contactForm.name} onChange={(event) => setContactForm((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={160} required /></label>
            <label>{t('leadContacts.jobTitle')}<TextField value={contactForm.jobTitle ?? ''} onChange={(event) => setContactForm((current) => ({ ...current, jobTitle: event.target.value }))} maxLength={120} placeholder={t('leadContacts.jobTitleHint')} /></label>
            <label>{t('common.email')}<TextField type="email" normalize="email" value={contactForm.email ?? ''} onChange={(event) => setContactForm((current) => ({ ...current, email: event.target.value }))} maxLength={254} /></label>
            <label>{t('common.phone')}<PhoneField value={contactForm.phone ?? ''} onValueChange={(phone) => setContactForm((current) => ({ ...current, phone }))} /></label>
            <label>{t('leadContacts.referral')}<TextField value={contactForm.referralNote ?? ''} onChange={(event) => setContactForm((current) => ({ ...current, referralNote: event.target.value }))} maxLength={500} placeholder={t('leadContacts.referralHint')} /></label>
            <label>{t('leadContacts.notes')}<TextareaField value={contactForm.notes ?? ''} onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))} maxLength={2000} /></label>
          </div>
          <p className="lead-contact-form-hint">{t('leadContacts.optionalChannelHint')}</p>
          <label className="lead-contact-interest-field"><CheckboxField checked={contactForm.isInterested} onChange={(event) => setContactForm((current) => ({ ...current, isInterested: event.target.checked }))} />{t('leadContacts.markInterested')}</label>
          <Button className="primary" disabled={contactsSaving}>{contactsSaving ? t('common.saving') : t('leadContacts.save')}</Button>
        </form>
      </>}
    </Modal>
    {error && leads.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    {statusUpdate && <div className="status-change-backdrop"><form className="status-change-dialog" role="dialog" aria-modal="true" aria-labelledby="status-change-title" onSubmit={(event) => { event.preventDefault(); void updateStatus(statusUpdate.lead.id, statusUpdate.status, statusReason.trim()) }}>
      <p className="eyebrow">{t('statusEvidence.eyebrow')}</p><h3 id="status-change-title">{t('statusEvidence.title')}</h3><p>{t('statusEvidence.description', { company: statusUpdate.lead.accountName, status: t(`leadStatuses.${statusUpdate.status}`) })}</p>
      <label>{t('statusEvidence.reason')}<TextareaField value={statusReason} onChange={(event) => setStatusReason(event.target.value)} minLength={3} maxLength={1000} required autoFocus /></label>
      <div className="status-change-actions"><Button type="button" className="status-change-cancel" disabled={statusSaving} onClick={() => setStatusUpdate(null)}>{t('common.cancel')}</Button><Button className="primary" disabled={statusSaving || statusReason.trim().length < 3}>{statusSaving ? t('common.saving') : t('statusEvidence.confirm')}</Button></div>
    </form></div>}
    <div className="lead-list-panel">
      <div className="lead-list-toolbar"><div><h3>{t('leads.queue')}</h3><p>{t('leads.count', { count: total })}</p></div></div>
      <DataTable rows={leads} columns={columns} getRowId={(lead) => lead.id} sort={{ key: sortBy, direction: sortDirection }} onSortChange={(key, direction) => { setSortBy(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit: pageSize, offset, total, hasNextPage }} onPageChange={setOffset} onPageSizeChange={(value) => { setPageSize(value); setOffset(0) }} filters={filters} loading={loading} emptyState={emptyState} emptyStateKind={error ? 'error' : 'empty'} />
    </div>
  </section>
}
