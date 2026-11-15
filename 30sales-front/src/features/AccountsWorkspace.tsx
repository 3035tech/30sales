import { Button, SelectField, TextField } from '../components/ui/FormControls'
import { useEffect, useState } from 'react'
import { ArrowRight, Building2, RefreshCw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type AccountSortBy, type LeadStatus } from '../lib/api/client'
import i18n from '../lib/i18n'
import './AccountsWorkspace.css'

type AccountRow = Awaited<ReturnType<typeof api.accounts.listPage>>['data'][number]
const statuses: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']

export function AccountsWorkspace({ onOpenLeads }: { onOpenLeads: (accountName: string) => void }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState<AccountRow[]>([])
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [leadStatus, setLeadStatus] = useState<LeadStatus | ''>('')
  const [sortBy, setSortBy] = useState<AccountSortBy>('latestActivityAt')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => { const timer = window.setTimeout(() => { setSearch(query); setOffset(0) }, 250); return () => window.clearTimeout(timer) }, [query])
  useEffect(() => {
    let active = true
    setLoading(true); setError(false)
    api.accounts.listPage({ search: search || undefined, leadStatus: leadStatus || undefined, sortBy, sortDirection, limit, offset })
      .then((page) => { if (active) { setRows(page.data); setTotal(page.pagination.total); setHasNextPage(page.pagination.hasNextPage) } })
      .catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [search, leadStatus, sortBy, sortDirection, limit, offset, refresh])

  const columns: DataTableColumn<AccountRow, AccountSortBy>[] = [
    { id: 'accountName', label: t('accounts.columns.account'), render: (row) => <Button className="account-name-cell account-name-link" type="button" onClick={() => onOpenLeads(row.name)}><Building2 size={16} /><strong>{row.name}</strong><ArrowRight size={14} /></Button> },
    { id: 'contactCount', label: t('accounts.columns.contacts'), render: (row) => row.contactCount },
    { id: 'leadCount', label: t('accounts.columns.leads'), render: (row) => row.leadCount },
    { id: 'respondedCount', label: t('accounts.columns.responded'), render: (row) => row.respondedCount },
    { id: 'opportunityCount', label: t('accounts.columns.opportunities'), render: (row) => row.opportunityCount },
    { id: 'latestActivityAt', label: t('accounts.columns.lastActivity'), render: (row) => row.latestActivityAt ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.latestActivityAt)) : '—' },
  ]
  const emptyState = <div><strong>{error ? t('accounts.loadFailed') : t('accounts.empty')}</strong>{!error && (search || leadStatus) && <Button className="text-button" onClick={() => { setQuery(''); setSearch(''); setLeadStatus(''); setOffset(0) }}>{t('accounts.clearFilters')}</Button>}</div>
  return <section className="accounts-page">
    <header className="accounts-heading"><div><p className="eyebrow">{t('accounts.eyebrow')}</p><h2>{t('accounts.title')}</h2><p className="muted">{t('accounts.description')}</p></div><Button className="refresh" onClick={() => setRefresh((value) => value + 1)} aria-label={t('accounts.refresh')}><RefreshCw size={16} /></Button></header>
    {error && rows.length > 0 && <WorkspaceState kind="error" compact message={t('accounts.loadFailed')} detail={t('table.resultsRetained')} />}
    <DataTable rows={rows} columns={columns} getRowId={(row) => row.id} sort={{ key: sortBy, direction: sortDirection }} onSortChange={(key, direction) => { setSortBy(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit, offset, total, hasNextPage }} onPageChange={setOffset} onPageSizeChange={(size) => { setLimit(size); setOffset(0) }} loading={loading} emptyState={emptyState} emptyStateKind={error ? 'error' : 'empty'} filters={<>
      <label className="account-search"><Search size={15} /><TextField value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('accounts.search')} aria-label={t('accounts.search')} /></label>
      <label className="account-status-filter">{t('common.status')}<SelectField value={leadStatus} onChange={(event) => { setLeadStatus((statuses.find((status) => status === event.target.value) ?? '') as LeadStatus | ''); setOffset(0) }}><option value="">{t('accounts.allStatuses')}</option>{statuses.map((status) => <option key={status} value={status}>{t(`leadStatuses.${status}`)}</option>)}</SelectField></label>
    </>} />
  </section>
}
