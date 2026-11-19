import { useEffect, useState } from 'react'
import { Building2, Check, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, TextField } from '../components/ui/FormControls'
import { Modal } from '../components/ui/Modal'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import type { PlatformOrganizationDto } from '../lib/api/contracts'
import { platformApi } from '../lib/api/domains/platform'
import { PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE, PLATFORM_SEARCH_DEBOUNCE_MILLISECONDS } from '../lib/authorizationConstants'
import './PlatformOrganizationPicker.css'

type PlatformOrganizationPickerProps = {
  activeOrganizationId: string | null
  activeOrganizationName: string
  platformOrganizationContext: boolean
  disabled: boolean
  onSelectOrganization: (organizationId: string) => Promise<boolean>
}

export function PlatformOrganizationPicker({ activeOrganizationId, activeOrganizationName, platformOrganizationContext, disabled, onSelectOrganization }: PlatformOrganizationPickerProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [companies, setCompanies] = useState<PlatformOrganizationDto[]>([])
  const [total, setTotal] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [selectionError, setSelectionError] = useState(false)
  const [selectingId, setSelectingId] = useState('')

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    setLoadError(false)
    const timer = window.setTimeout(() => {
      platformApi.organizations({ search: query.trim() || undefined, limit: PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE, offset })
        .then((result) => {
          if (!active) return
          setCompanies(result.data)
          setTotal(result.pagination.total)
          setHasNextPage(result.pagination.hasNextPage)
        })
        .catch(() => { if (active) setLoadError(true) })
        .finally(() => { if (active) setLoading(false) })
    }, query ? PLATFORM_SEARCH_DEBOUNCE_MILLISECONDS : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [open, query, offset, refreshVersion])

  const selectOrganization = async (organizationId: string) => {
    setSelectingId(organizationId)
    setSelectionError(false)
    const selected = await onSelectOrganization(organizationId)
    if (selected) setOpen(false)
    else setSelectionError(true)
    setSelectingId('')
  }

  const rangeEnd = Math.min(offset + PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE, total)

  return <>
    <Button type="button" className="workspace platform-organization-trigger" disabled={disabled} aria-haspopup="dialog" onClick={() => { setSelectionError(false); setOpen(true) }}>
      <Building2 size={16} aria-hidden="true" />
      <span>{activeOrganizationName || t('platform.selectCompany')}</span>
      <ChevronRight size={15} aria-hidden="true" />
    </Button>
    <Modal open={open} onOpenChange={setOpen} title={t('platform.selectCompany')} description={t('platform.selectCompanyHint')} closeLabel={t('common.close')} className="platform-organization-picker">
      <label className="platform-picker-search"><Search size={16} aria-hidden="true" /><TextField type="search" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder={t('platform.searchHint')} aria-label={t('platform.search')} /></label>
      {selectionError && <WorkspaceState kind="error" compact message={t('errors.requestFailed')} />}
      {loadError && companies.length > 0 && <WorkspaceState kind="error" compact message={t('platform.loadFailed')} detail={t('table.resultsRetained')} />}
      {loading && companies.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} />
        : loadError && companies.length === 0 ? <WorkspaceState kind="error" message={t('platform.loadFailed')} />
          : companies.length === 0 ? <WorkspaceState kind="empty" message={t('platform.empty')} />
            : <ul className="platform-picker-results">{companies.map((company) => {
              const selected = activeOrganizationId === company.id && platformOrganizationContext
              return <li key={company.id}><Button type="button" disabled={selected || selectingId !== ''} aria-current={selected ? 'true' : undefined} onClick={() => void selectOrganization(company.id)}>
                <span className="platform-picker-company-icon"><Building2 size={17} aria-hidden="true" /></span>
                <span className="platform-picker-company"><strong>{company.name}</strong><small>{company.slug} · {t('platform.memberCount', { count: company.memberCount })}</small></span>
                {selected ? <span className="platform-picker-current"><Check size={15} aria-hidden="true" />{t('platform.currentCompany')}</span> : <span className="platform-picker-open">{selectingId === company.id ? t('common.loading') : t('platform.openWorkspace')}</span>}
              </Button></li>
            })}</ul>}
      {total > 0 && <footer className="platform-picker-pagination"><span>{t('table.range', { from: offset + 1, to: rangeEnd, total })}</span><div><Button type="button" disabled={offset === 0 || loading} aria-label={t('common.previousPage')} onClick={() => setOffset((current) => Math.max(0, current - PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE))}><ChevronLeft size={16} /></Button><Button type="button" disabled={!hasNextPage || loading} aria-label={t('common.nextPage')} onClick={() => setOffset((current) => current + PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE)}><ChevronRight size={16} /></Button></div></footer>}
      {loadError && <Button type="button" className="platform-picker-retry" onClick={() => setRefreshVersion((current) => current + 1)}>{t('platform.retry')}</Button>}
    </Modal>
  </>
}
