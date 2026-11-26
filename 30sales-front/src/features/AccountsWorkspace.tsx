import { Button, IconButton, NumericField, SelectField, TextField } from '../components/ui/FormControls'
import { useEffect, useState } from 'react'
import { ArrowRight, Building2, RefreshCw, Search, SlidersHorizontal, Tags, UserMinus, UserPlus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { ACCOUNT_SEGMENT_ERROR_CODE, ACCOUNT_SEGMENT_FILTER, api, ApiError, type AccountMarketSegment, type AccountSegmentDto, type AccountSortBy, type LeadStatus } from '../lib/api'
import { ACCOUNT_CONTACT_ERROR_CODE, ACCOUNT_CONTACT_LIMITS, ACCOUNT_MARKET_FILTER, ACCOUNT_MARKET_SEGMENTS, ACCOUNT_PERSON_STATUS, ACCOUNT_PROFILE_EMPTY_VALUE } from '../lib/accountConstants'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import i18n from '../lib/i18n'
import './AccountsWorkspace.css'
import './AccountProfile.css'

type AccountRow = Awaited<ReturnType<typeof api.accounts.listPage>>['data'][number]
const statuses: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']

export function AccountsWorkspace({ onOpenLeads, canManageSegments, canUpdateProfile }: { onOpenLeads: (accountName: string) => void; canManageSegments: boolean; canUpdateProfile: boolean }) {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const businessLineId = searchParams.get('businessLineId') ?? undefined
  const [rows, setRows] = useState<AccountRow[]>([])
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [leadStatus, setLeadStatus] = useState<LeadStatus | ''>('')
  const [segmentFilter, setSegmentFilter] = useState('')
  const [marketFilter, setMarketFilter] = useState<string>(ACCOUNT_MARKET_FILTER.all)
  const [studentCountMin, setStudentCountMin] = useState<number | null>(null)
  const [studentCountMax, setStudentCountMax] = useState<number | null>(null)
  const [segments, setSegments] = useState<AccountSegmentDto[]>([])
  const [segmentDraft, setSegmentDraft] = useState('')
  const [segmentError, setSegmentError] = useState('')
  const [profileError, setProfileError] = useState('')
  const [segmentModalOpen, setSegmentModalOpen] = useState(false)
  const [savingSegment, setSavingSegment] = useState(false)
  const [sortBy, setSortBy] = useState<AccountSortBy>('latestActivityAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [profileAccount, setProfileAccount] = useState<AccountRow | null>(null)
  const [profileMarketSegment, setProfileMarketSegment] = useState<AccountMarketSegment | typeof ACCOUNT_PROFILE_EMPTY_VALUE>(ACCOUNT_PROFILE_EMPTY_VALUE)
  const [profileStudentCount, setProfileStudentCount] = useState<number | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [contactsAccount, setContactsAccount] = useState<AccountRow | null>(null)
  const [accountContacts, setAccountContacts] = useState<Awaited<ReturnType<typeof api.accounts.contacts>> | null>(null)
  const [accountContactsOffset, setAccountContactsOffset] = useState<number>(ACCOUNT_CONTACT_LIMITS.offsetStart)
  const [accountContactsLoading, setAccountContactsLoading] = useState(false)
  const [accountContactsError, setAccountContactsError] = useState('')
  const [contactToUnlink, setContactToUnlink] = useState<{ id: string; name: string } | null>(null)
  const studentRangeInvalid = studentCountMin !== null && studentCountMax !== null && studentCountMin > studentCountMax

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setOffset(0) }, 250); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => {
    let active = true
    if (studentRangeInvalid) { setRows([]); setTotal(0); setHasNextPage(false); setLoading(false); setError(false); return () => { active = false } }
    setLoading(true); setError(false)
    api.accounts.listPage({ businessLineId, search: search || undefined, leadStatus: leadStatus || undefined, segmentId: segmentFilter || undefined, marketSegment: ACCOUNT_MARKET_SEGMENTS.find((segment) => segment === marketFilter), withoutMarketSegment: marketFilter === ACCOUNT_MARKET_FILTER.unclassified || undefined, studentCountMin: studentCountMin ?? undefined, studentCountMax: studentCountMax ?? undefined, sortBy, sortDirection, limit, offset })
      .then((page) => { if (active) { setRows(page.data); setTotal(page.pagination.total); setHasNextPage(page.pagination.hasNextPage) } })
      .catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [businessLineId, search, leadStatus, segmentFilter, marketFilter, studentCountMin, studentCountMax, studentRangeInvalid, sortBy, sortDirection, limit, offset, refresh])
  useEffect(() => { api.accounts.segments().then(setSegments).catch(() => setSegmentError(t('accounts.segmentsLoadFailed'))) }, [t])

  const saveSegment = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = segmentDraft.trim()
    if (name.length < 2) return
    setSavingSegment(true)
    setSegmentError('')
    try {
      const created = await api.accounts.createSegment(name)
      setSegments((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name, i18n.language)))
      setSegmentDraft('')
      setRefresh((value) => value + 1)
    } catch (caught) {
      setSegmentError(caught instanceof ApiError && caught.code === ACCOUNT_SEGMENT_ERROR_CODE.alreadyExists ? t('accounts.segmentExists') : t('accounts.segmentSaveFailed'))
    } finally { setSavingSegment(false) }
  }
  const assignSegment = async (accountId: string, segmentId: string) => {
    setSegmentError('')
    try { await api.accounts.assignSegment(accountId, segmentId || null); setRefresh((value) => value + 1) }
    catch { setSegmentError(t('accounts.segmentAssignFailed')) }
  }
  const openProfile = (row: AccountRow) => { setProfileError(''); setProfileAccount(row); setProfileMarketSegment(row.marketSegment ?? ACCOUNT_PROFILE_EMPTY_VALUE); setProfileStudentCount(row.studentCount) }
  const loadAccountContacts = async (accountId: string, offset: number) => {
    setAccountContactsLoading(true)
    setAccountContactsError('')
    try {
      const page = await api.accounts.contacts(accountId, { businessLineId, limit: ACCOUNT_CONTACT_LIMITS.pageSize, offset })
      setAccountContacts(page)
      setAccountContactsOffset(offset)
    } catch { setAccountContactsError(t('accounts.contactsLoadFailed')) }
    finally { setAccountContactsLoading(false) }
  }
  const openAccountContacts = (row: AccountRow) => {
    setContactsAccount(row)
    setAccountContacts(null)
    setAccountContactsOffset(ACCOUNT_CONTACT_LIMITS.offsetStart)
    void loadAccountContacts(row.id, ACCOUNT_CONTACT_LIMITS.offsetStart)
  }
  const unlinkAccountContact = async () => {
    if (!contactsAccount || !contactToUnlink) return
    setAccountContactsError('')
    try {
      await api.accounts.unlinkContact(contactsAccount.id, contactToUnlink.id, businessLineId)
      setContactToUnlink(null)
      await loadAccountContacts(contactsAccount.id, accountContactsOffset)
      setRefresh((value) => value + 1)
    } catch (caught) {
      setAccountContactsError(caught instanceof ApiError && caught.code === ACCOUNT_CONTACT_ERROR_CODE.alreadyUnlinked ? t('accounts.contactAlreadyUnlinked') : t('accounts.contactUnlinkFailed'))
    }
  }
  const restoreAccountContact = async (personId: string) => {
    if (!contactsAccount) return
    setAccountContactsError('')
    try {
      await api.accounts.restoreContact(contactsAccount.id, personId, businessLineId)
      await loadAccountContacts(contactsAccount.id, accountContactsOffset)
      setRefresh((value) => value + 1)
    } catch (caught) {
      setAccountContactsError(caught instanceof ApiError && caught.code === ACCOUNT_CONTACT_ERROR_CODE.alreadyLinked ? t('accountContacts.contactAlreadyLinked') : t('accountContacts.contactLinkFailed'))
    }
  }
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!profileAccount) return
    setProfileSaving(true)
    setProfileError('')
    try {
      await api.accounts.updateProfile(profileAccount.id, { marketSegment: profileMarketSegment === ACCOUNT_PROFILE_EMPTY_VALUE ? null : profileMarketSegment, studentCount: profileStudentCount })
      setProfileAccount(null)
      setRefresh((value) => value + 1)
    } catch { setProfileError(t('accountProfileFields.profileSaveFailed')) }
    finally { setProfileSaving(false) }
  }

  const columns: DataTableColumn<AccountRow, AccountSortBy>[] = [
    { id: 'accountName', label: t('accounts.columns.account'), render: (row) => <div className="account-row-actions"><div className="account-name-primary"><Button className="account-name-cell account-name-link" type="button" onClick={() => onOpenLeads(row.name)}><Building2 size={16} /><strong>{row.name}</strong><ArrowRight size={14} /></Button><small>{row.marketSegment ? t(`accountProfileFields.marketSegments.${row.marketSegment}`) : t('accountProfileFields.unclassifiedMarketSegment')}{row.studentCount !== null && <span>{t('accountProfileFields.studentsShort', { count: new Intl.NumberFormat(i18n.language).format(row.studentCount) })}</span>}</small></div><div className="account-row-icon-actions"><IconButton label={t('accountContacts.manageFor', { account: row.name })} onClick={() => openAccountContacts(row)}><Users size={15} /></IconButton>{canUpdateProfile && <IconButton label={t('accountProfileFields.editProfileFor', { account: row.name })} onClick={() => openProfile(row)}><SlidersHorizontal size={15} /></IconButton>}</div></div> },
    { id: 'segment', label: t('accounts.columns.segment'), render: (row) => canManageSegments ? <SelectField className="account-segment-select" aria-label={t('accounts.segmentFor', { account: row.name })} value={row.segmentId ?? ''} onChange={(event) => void assignSegment(row.id, event.target.value)}><option value="">{t('accounts.unsegmented')}</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</SelectField> : row.segmentName ?? '—' },
    { id: 'contactCount', label: t('accounts.columns.contacts'), render: (row) => row.contactCount },
    { id: 'leadCount', label: t('accounts.columns.leads'), render: (row) => row.leadCount },
    { id: 'respondedCount', label: t('accounts.columns.responded'), render: (row) => row.respondedCount },
    { id: 'opportunityCount', label: t('accounts.columns.opportunities'), render: (row) => row.opportunityCount },
    { id: 'latestActivityAt', label: t('accounts.columns.lastActivity'), render: (row) => row.latestActivityAt ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.latestActivityAt)) : '—' },
  ]
  const emptyState = <div><strong>{error ? t('accounts.loadFailed') : t('accounts.empty')}</strong>{!error && (search || leadStatus || segmentFilter || marketFilter !== ACCOUNT_MARKET_FILTER.all || studentCountMin !== null || studentCountMax !== null) && <Button className="text-button" onClick={() => { setQuery(''); setSearch(''); setLeadStatus(''); setSegmentFilter(''); setMarketFilter(ACCOUNT_MARKET_FILTER.all); setStudentCountMin(null); setStudentCountMax(null); setOffset(0) }}>{t('accounts.clearFilters')}</Button>}</div>
  return <section className="accounts-page">
    <header className="accounts-heading"><div><p className="eyebrow">{t('accounts.eyebrow')}</p><h2>{t('accounts.title')}</h2><p className="muted">{t('accounts.description')}</p></div><Button className="refresh" onClick={() => setRefresh((value) => value + 1)} aria-label={t('accounts.refresh')}><RefreshCw size={16} /></Button></header>
    {error && rows.length > 0 && <WorkspaceState kind="error" compact message={t('accounts.loadFailed')} detail={t('table.resultsRetained')} />}
    {segmentError && <WorkspaceState kind="error" compact message={segmentError} />}
    {canManageSegments && <div className="account-segment-toolbar"><span><Tags size={16} />{t('accounts.segmentCount', { count: segments.length })}</span><Button type="button" onClick={() => { setSegmentDraft(''); setSegmentError(''); setSegmentModalOpen(true) }}>{t('accounts.manageSegments')}</Button></div>}
    <DataTable rows={rows} columns={columns} getRowId={(row) => row.id} sort={{ key: sortBy, direction: sortDirection }} onSortChange={(key, direction) => { setSortBy(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit, offset, total, hasNextPage }} onPageChange={setOffset} onPageSizeChange={(size) => { setLimit(size); setOffset(0) }} loading={loading} emptyState={emptyState} emptyStateKind={error ? 'error' : 'empty'} filters={<>
      <label className="account-search"><Search size={15} /><TextField value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('accounts.search')} aria-label={t('accounts.search')} /></label>
      <label className="account-status-filter">{t('common.status')}<SelectField value={leadStatus} onChange={(event) => { setLeadStatus(statuses.find((status) => status === event.target.value) ?? ''); setOffset(0) }}><option value="">{t('accounts.allStatuses')}</option>{statuses.map((status) => <option key={status} value={status}>{t(`leadStatuses.${status}`)}</option>)}</SelectField></label>
      <label className="account-status-filter">{t('accounts.columns.segment')}<SelectField value={segmentFilter} onChange={(event) => { setSegmentFilter(event.target.value); setOffset(0) }}><option value="">{t('accounts.allSegments')}</option><option value={ACCOUNT_SEGMENT_FILTER.unassigned}>{t('accounts.unsegmented')}</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</SelectField></label>
      <label className="account-status-filter">{t('accountProfileFields.marketSegment')}<SelectField value={marketFilter} onChange={(event) => { setMarketFilter(event.target.value); setOffset(0) }}><option value={ACCOUNT_MARKET_FILTER.all}>{t('accountProfileFields.allMarketSegments')}</option><option value={ACCOUNT_MARKET_FILTER.unclassified}>{t('accountProfileFields.unclassifiedMarketSegment')}</option>{ACCOUNT_MARKET_SEGMENTS.map((segment) => <option key={segment} value={segment}>{t(`accountProfileFields.marketSegments.${segment}`)}</option>)}</SelectField></label>
      <label className="account-size-filter">{t('accountProfileFields.minStudents')}<NumericField mode="integer" min={0} max={10000000} value={studentCountMin} onValueChange={(value) => { setStudentCountMin(value); setOffset(0) }} /></label>
      <label className="account-size-filter">{t('accountProfileFields.maxStudents')}<NumericField mode="integer" min={0} max={10000000} value={studentCountMax} onValueChange={(value) => { setStudentCountMax(value); setOffset(0) }} /></label>
      {studentRangeInvalid && <small className="account-filter-error" role="alert">{t('accountProfileFields.invalidStudentRange')}</small>}
    </>} />
    <Modal open={segmentModalOpen} onOpenChange={setSegmentModalOpen} title={t('accounts.manageSegments')} description={t('accounts.segmentHelp')} closeLabel={t('common.close')}>
      {segmentError && <WorkspaceState kind="error" compact message={segmentError} />}
      <form className="account-segment-form" onSubmit={(event) => void saveSegment(event)}><label>{t('accounts.newSegment')}<TextField value={segmentDraft} onChange={(event) => setSegmentDraft(event.target.value)} minLength={2} maxLength={80} required /></label><Button className="primary" disabled={savingSegment || segmentDraft.trim().length < 2}>{savingSegment ? t('common.saving') : t('accounts.addSegment')}</Button></form>
      <ul className="account-segment-list">{segments.map((segment) => <li key={segment.id}>{segment.name}</li>)}</ul>
    </Modal>
    <Modal open={profileAccount !== null} onOpenChange={(open) => { if (!open) setProfileAccount(null) }} title={t('accountProfileFields.editProfile')} description={profileAccount?.name ?? ''} closeLabel={t('common.close')} className="account-profile-modal">
      {profileError && <WorkspaceState kind="error" compact message={profileError} />}
      <form className="account-profile-form" onSubmit={(event) => void saveProfile(event)}>
        <div className="account-profile-context"><Building2 size={18} aria-hidden="true" /><p>{t('accountProfileFields.profileIntro')}</p></div>
        <label>{t('accountProfileFields.marketSegment')}<SelectField value={profileMarketSegment} onChange={(event) => setProfileMarketSegment(ACCOUNT_MARKET_SEGMENTS.find((segment) => segment === event.target.value) ?? ACCOUNT_PROFILE_EMPTY_VALUE)}><option value={ACCOUNT_PROFILE_EMPTY_VALUE}>{t('accountProfileFields.notProvided')}</option>{ACCOUNT_MARKET_SEGMENTS.map((segment) => <option key={segment} value={segment}>{t(`accountProfileFields.marketSegments.${segment}`)}</option>)}</SelectField><small>{t('accountProfileFields.marketSegmentHint')}</small></label>
        {profileMarketSegment === 'education' && <label>{t('accountProfileFields.studentCount')}<NumericField mode="integer" min={0} max={10000000} value={profileStudentCount} onValueChange={setProfileStudentCount} /><small>{t('accountProfileFields.studentCountHint')}</small></label>}
        <div className="account-profile-actions"><Button type="button" onClick={() => setProfileAccount(null)}>{t('common.cancel')}</Button><Button className="primary" disabled={profileSaving}>{profileSaving ? t('common.saving') : t('accountProfileFields.saveProfile')}</Button></div>
      </form>
    </Modal>
    <Modal open={contactsAccount !== null} onOpenChange={(open) => { if (!open) { setContactsAccount(null); setAccountContacts(null); setAccountContactsError(''); setContactToUnlink(null) } }} title={t('accountContacts.title')} description={contactsAccount?.name ?? ''} closeLabel={t('common.close')} className="account-contacts-modal">
      <div className="account-contacts-intro"><Users size={18} aria-hidden="true" /><p>{t('accountContacts.description')}</p></div>
      {accountContactsError && <><WorkspaceState kind="error" compact message={accountContactsError} /><Button type="button" onClick={() => contactsAccount && void loadAccountContacts(contactsAccount.id, accountContactsOffset)}>{t('accountContacts.retry')}</Button></>}
      {accountContactsLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : accountContacts && !accountContactsError && (accountContacts.data.length ? <ul className="account-contact-directory-list">
        {accountContacts.data.map((person) => <li key={person.id}><div><strong>{person.name}</strong><span>{person.email ?? person.phone ?? t('accountContacts.noDetails')}</span><small>{t('accountContacts.leadCount', { count: person.leadCount })} · {person.status === ACCOUNT_PERSON_STATUS.active ? t('accountContacts.active') : t('accountContacts.unlinked')}</small></div>{canUpdateProfile && (person.status === ACCOUNT_PERSON_STATUS.active ? <IconButton label={t('accountContacts.unlink', { name: person.name })} onClick={() => setContactToUnlink({ id: person.id, name: person.name })}><UserMinus size={16} /></IconButton> : <IconButton label={t('accountContacts.restore', { name: person.name })} onClick={() => void restoreAccountContact(person.id)}><UserPlus size={16} /></IconButton>)}</li>)}
      </ul> : <WorkspaceState kind="empty" message={t('accountContacts.empty')} />)}
      {accountContacts && accountContacts.pagination.total > ACCOUNT_CONTACT_LIMITS.pageSize && <div className="account-contact-directory-pagination">
        <Button type="button" disabled={accountContactsOffset <= ACCOUNT_CONTACT_LIMITS.offsetStart || accountContactsLoading} onClick={() => contactsAccount && void loadAccountContacts(contactsAccount.id, Math.max(ACCOUNT_CONTACT_LIMITS.offsetStart, accountContactsOffset - ACCOUNT_CONTACT_LIMITS.pageSize))}>{t('common.previousPage')}</Button>
        <span>{t('accountContacts.page', { page: Math.floor(accountContactsOffset / ACCOUNT_CONTACT_LIMITS.pageSize) + ACCOUNT_CONTACT_LIMITS.pageStart })}</span>
        <Button type="button" disabled={!accountContacts.pagination.hasNextPage || accountContactsLoading} onClick={() => contactsAccount && void loadAccountContacts(contactsAccount.id, accountContactsOffset + ACCOUNT_CONTACT_LIMITS.pageSize)}>{t('common.nextPage')}</Button>
      </div>}
    </Modal>
    <ConfirmDialog open={contactToUnlink !== null} onOpenChange={(open) => { if (!open) setContactToUnlink(null) }} title={t('accountContacts.unlinkTitle')} description={contactToUnlink ? t('accountContacts.unlinkConfirm', { name: contactToUnlink.name }) : ''} confirmLabel={t('accountContacts.unlinkAction')} cancelLabel={t('common.cancel')} closeLabel={t('common.close')} destructive onConfirm={unlinkAccountContact} />
  </section>
}
