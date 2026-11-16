import { Button, IconButton, NumericField, SelectField, TextField } from '../components/ui/FormControls'
import { useEffect, useState } from 'react'
import { ArrowRight, Building2, RefreshCw, Search, SlidersHorizontal, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { ACCOUNT_SEGMENT_ERROR_CODE, ACCOUNT_SEGMENT_FILTER, api, ApiError, type AccountMarketSegment, type AccountSegmentDto, type AccountSortBy, type LeadStatus } from '../lib/api/client'
import { ACCOUNT_MARKET_FILTER, ACCOUNT_MARKET_SEGMENTS, ACCOUNT_PROFILE_EMPTY_VALUE } from '../lib/accountConstants'
import { Modal } from '../components/ui/Modal'
import i18n from '../lib/i18n'
import './AccountsWorkspace.css'
import './AccountProfile.css'

type AccountRow = Awaited<ReturnType<typeof api.accounts.listPage>>['data'][number]
const statuses: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']

export function AccountsWorkspace({ onOpenLeads, canManageSegments, canUpdateProfile }: { onOpenLeads: (accountName: string) => void; canManageSegments: boolean; canUpdateProfile: boolean }) {
  const { t } = useTranslation()
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
  const studentRangeInvalid = studentCountMin !== null && studentCountMax !== null && studentCountMin > studentCountMax

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setOffset(0) }, 250); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => {
    let active = true
    if (studentRangeInvalid) { setRows([]); setTotal(0); setHasNextPage(false); setLoading(false); setError(false); return () => { active = false } }
    setLoading(true); setError(false)
    api.accounts.listPage({ search: search || undefined, leadStatus: leadStatus || undefined, segmentId: segmentFilter || undefined, marketSegment: ACCOUNT_MARKET_SEGMENTS.find((segment) => segment === marketFilter), withoutMarketSegment: marketFilter === ACCOUNT_MARKET_FILTER.unclassified || undefined, studentCountMin: studentCountMin ?? undefined, studentCountMax: studentCountMax ?? undefined, sortBy, sortDirection, limit, offset })
      .then((page) => { if (active) { setRows(page.data); setTotal(page.pagination.total); setHasNextPage(page.pagination.hasNextPage) } })
      .catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, leadStatus, segmentFilter, marketFilter, studentCountMin, studentCountMax, studentRangeInvalid, sortBy, sortDirection, limit, offset, refresh])
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
  const openProfile = (row: AccountRow) => { setSegmentError(''); setProfileAccount(row); setProfileMarketSegment(row.marketSegment ?? ACCOUNT_PROFILE_EMPTY_VALUE); setProfileStudentCount(row.studentCount) }
  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!profileAccount) return
    setProfileSaving(true)
    setSegmentError('')
    try {
      await api.accounts.updateProfile(profileAccount.id, { marketSegment: profileMarketSegment === ACCOUNT_PROFILE_EMPTY_VALUE ? null : profileMarketSegment, studentCount: profileStudentCount })
      setProfileAccount(null)
      setRefresh((value) => value + 1)
    } catch { setSegmentError(t('accountProfileFields.profileSaveFailed')) }
    finally { setProfileSaving(false) }
  }

  const columns: DataTableColumn<AccountRow, AccountSortBy>[] = [
    { id: 'accountName', label: t('accounts.columns.account'), render: (row) => <div className="account-row-actions"><div className="account-name-primary"><Button className="account-name-cell account-name-link" type="button" onClick={() => onOpenLeads(row.name)}><Building2 size={16} /><strong>{row.name}</strong><ArrowRight size={14} /></Button><small>{row.marketSegment ? t(`accountProfileFields.marketSegments.${row.marketSegment}`) : t('accountProfileFields.unclassifiedMarketSegment')}{row.studentCount !== null && <span>{t('accountProfileFields.studentsShort', { count: new Intl.NumberFormat(i18n.language).format(row.studentCount) })}</span>}</small></div>{canUpdateProfile && <IconButton label={t('accountProfileFields.editProfileFor', { account: row.name })} onClick={() => openProfile(row)}><SlidersHorizontal size={15} /></IconButton>}</div> },
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
      <label className="account-status-filter">{t('common.status')}<SelectField value={leadStatus} onChange={(event) => { setLeadStatus((statuses.find((status) => status === event.target.value) ?? '') as LeadStatus | ''); setOffset(0) }}><option value="">{t('accounts.allStatuses')}</option>{statuses.map((status) => <option key={status} value={status}>{t(`leadStatuses.${status}`)}</option>)}</SelectField></label>
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
    <Modal open={profileAccount !== null} onOpenChange={(open) => { if (!open) setProfileAccount(null) }} title={t('accountProfileFields.editProfile')} description={profileAccount?.name ?? ''} closeLabel={t('common.close')}>
      {segmentError && <WorkspaceState kind="error" compact message={segmentError} />}
      <form className="account-profile-form" onSubmit={(event) => void saveProfile(event)}>
        <label>{t('accountProfileFields.marketSegment')}<SelectField value={profileMarketSegment} onChange={(event) => setProfileMarketSegment(ACCOUNT_MARKET_SEGMENTS.find((segment) => segment === event.target.value) ?? ACCOUNT_PROFILE_EMPTY_VALUE)}><option value={ACCOUNT_PROFILE_EMPTY_VALUE}>{t('accountProfileFields.notProvided')}</option>{ACCOUNT_MARKET_SEGMENTS.map((segment) => <option key={segment} value={segment}>{t(`accountProfileFields.marketSegments.${segment}`)}</option>)}</SelectField></label>
        <label>{t('accountProfileFields.studentCount')}<NumericField mode="integer" min={0} max={10000000} value={profileStudentCount} onValueChange={setProfileStudentCount} /><small>{t('accountProfileFields.studentCountHint')}</small></label>
        <div className="account-profile-actions"><Button type="button" onClick={() => setProfileAccount(null)}>{t('common.cancel')}</Button><Button className="primary" disabled={profileSaving}>{profileSaving ? t('common.saving') : t('accountProfileFields.saveProfile')}</Button></div>
      </form>
    </Modal>
  </section>
}
