import { Button, SelectField, TextField } from '../components/ui/FormControls'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { useEffect, useState } from 'react'
import { ArrowRight, Building2, ChevronLeft, ChevronRight, Copy, LogOut, Plus, RefreshCw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ApiError, api, type CreatePlatformOrganizationInput, type PlatformOrganizationDto, type SessionDto } from '../lib/api'
import { ORGANIZATION_SLUG_PATTERN, PLATFORM_ERROR_CODE, PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE, PLATFORM_ORGANIZATION_PAGE_SIZES, PLATFORM_SEARCH_DEBOUNCE_MILLISECONDS } from '../lib/authorizationConstants'
import './PlatformWorkspace.css'


function slugFromName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

export function PlatformWorkspace({ user, organizations, onSignOut, onOpenOrganization, onSelectOrganization }: { user: SessionDto['user']; organizations: SessionDto['organizations']; onSignOut: () => Promise<void>; onOpenOrganization: (organizationId: string) => void; onSelectOrganization: (organizationId: string) => void }) {
  const { t, i18n } = useTranslation()
  const [companies, setCompanies] = useState<PlatformOrganizationDto[]>([])
  const [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0)
  const [pageSize, setPageSize] = useState<number>(PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [total, setTotal] = useState(0)
  const [hasNextPage, setHasNextPage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdMessage, setCreatedMessage] = useState('')
  const [invitationUrl, setInvitationUrl] = useState('')
  const [invitationEmailSent, setInvitationEmailSent] = useState(false)
  const [invitationBelongsToCurrentUser, setInvitationBelongsToCurrentUser] = useState(false)
  const [copied, setCopied] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [ownerEmail, setOwnerEmail] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setLoadError(false)
    const timer = window.setTimeout(() => {
      api.platform.organizations({ search: query.trim() || undefined, limit: pageSize, offset })
        .then((result) => { if (active) { setCompanies(result.data); setTotal(result.pagination.total); setHasNextPage(result.pagination.hasNextPage) } })
        .catch(() => { if (active) setLoadError(true) })
        .finally(() => { if (active) setLoading(false) })
    }, query ? PLATFORM_SEARCH_DEBOUNCE_MILLISECONDS : 0)
    return () => { active = false; window.clearTimeout(timer) }
  }, [query, pageSize, offset, refreshVersion])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setCreatedMessage('')
    setInvitationUrl('')
    setInvitationBelongsToCurrentUser(false)
    try {
      const input: CreatePlatformOrganizationInput = { name: name.trim(), slug: slug.trim(), ownerEmail: ownerEmail.trim().toLowerCase() }
      const result = await api.platform.createOrganization(input)
      setInvitationUrl(result.ownerInvitation.invitationUrl)
      setInvitationEmailSent(result.ownerInvitation.emailSent)
      setInvitationBelongsToCurrentUser(result.ownerInvitation.email.toLowerCase() === user.email.toLowerCase())
      setCreatedMessage(result.ownerInvitation.emailSent ? t('platform.invitationSent', { email: result.ownerInvitation.email }) : t('platform.invitationEmailUnavailable', { email: result.ownerInvitation.email }))
      setName('')
      setSlug('')
      setSlugEdited(false)
      setOwnerEmail('')
      setOffset(0)
      setRefreshVersion((current) => current + 1)
    } catch (caught) {
      setError(caught instanceof ApiError && caught.code === PLATFORM_ERROR_CODE.organizationSlugAlreadyExists ? t('platform.slugAlreadyExists') : t('platform.createFailed'))
    } finally {
      setSaving(false)
    }
  }

  const copyInvitation = async () => {
    if (!invitationUrl) return
    try { await navigator.clipboard.writeText(invitationUrl); setCopied(true) }
    catch { setCopied(false) }
  }

  const signOut = async () => {
    setSigningOut(true)
    try { await onSignOut() }
    finally { setSigningOut(false) }
  }

  return <main className="platform-shell">
    <header className="platform-topbar"><img src="/brand-kit/logos/logo-default.svg" alt="30Sales" /><div className="platform-user"><span className="avatar">{user.name.slice(0, 1)}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><Button type="button" className="platform-signout" disabled={signingOut} onClick={() => void signOut()}><LogOut size={16} />{t('platform.signOut')}</Button></div></header>
    <div className="platform-content">
      <header className="platform-heading"><div><p className="eyebrow">{t('platform.eyebrow')}</p><h1>{t('platform.title')}</h1><p>{t('platform.description')}</p></div><Button className="refresh" type="button" aria-label={t('platform.refresh')} onClick={() => setRefreshVersion((current) => current + 1)}><RefreshCw size={16} /></Button></header>
      <section className="platform-panel platform-workspaces-panel">
        <div className="platform-companies-heading"><div><h2>{t('platform.yourWorkspaces')}</h2><p>{t('platform.yourWorkspacesHint')}</p></div></div>
        {organizations.length === 0
          ? <WorkspaceState kind="empty" compact message={t('platform.noWorkspaceMembership')} detail={t('platform.noWorkspaceMembershipHint')}>{invitationBelongsToCurrentUser && invitationUrl && <a className="platform-accept-invitation" href={invitationUrl}>{t('platform.acceptInvitation')}<ArrowRight size={15} aria-hidden="true" /></a>}</WorkspaceState>
          : <ul className="platform-company-list">{organizations.map((organization) => <li key={organization.id}><span className="platform-company-icon"><Building2 size={17} /></span><span className="platform-company-copy"><strong>{organization.name}</strong><small>{organization.slug}</small></span><Button type="button" className="platform-open-workspace" onClick={() => onOpenOrganization(organization.id)}>{t('platform.openWorkspace')}<ArrowRight size={15} /></Button></li>)}</ul>}
      </section>
      <section className="platform-panel platform-create-panel">
        <div className="platform-panel-heading"><span className="card-icon"><Plus size={18} /></span><div><h2>{t('platform.createTitle')}</h2><p>{t('platform.createHint')}</p></div></div>
        <form className="platform-company-form" onSubmit={(event) => void submit(event)}>
          <label>{t('platform.companyName')}<TextField value={name} onChange={(event) => { const value = event.target.value; setName(value); if (!slugEdited) setSlug(slugFromName(value)) }} maxLength={160} required /></label>
          <label>{t('platform.companySlug')}<TextField value={slug} onChange={(event) => { setSlug(event.target.value); setSlugEdited(true) }} maxLength={80} pattern={ORGANIZATION_SLUG_PATTERN} required /><small>{t('platform.companySlugHint')}</small></label>
          <label>{t('platform.ownerEmail')}<TextField type="email" normalize="email" autoComplete="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} required /></label>
          <Button className="primary" disabled={saving}><Building2 size={16} />{saving ? t('platform.creating') : t('platform.createCompany')}</Button>
        </form>
        {error && <WorkspaceState kind="error" compact message={error} />}
        {createdMessage && <div className="platform-result" role="status"><strong>{createdMessage}</strong>{invitationUrl && <div className="platform-invitation-link"><a href={invitationUrl} target="_blank" rel="noreferrer">{t('platform.openInvitation')}</a><Button type="button" onClick={() => void copyInvitation()}><Copy size={15} />{copied ? t('platform.copied') : t('platform.copyInvitation')}</Button></div>}{!invitationEmailSent && invitationUrl && <small>{t('platform.invitationFallback')}</small>}</div>}
      </section>
      <section className="platform-panel platform-companies-panel">
        <div className="platform-companies-heading"><div><h2>{t('platform.companies')}</h2><p>{t('platform.companyCount', { count: total })}</p></div><label className="platform-search"><Search size={16} /><TextField type="search" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder={t('platform.searchHint')} aria-label={t('platform.search')} /></label></div>
        {loadError && companies.length > 0 && <WorkspaceState kind="error" compact message={t('platform.loadFailed')} detail={t('table.resultsRetained')} />}
        {loading && companies.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : loadError && companies.length === 0 ? <WorkspaceState kind="error" message={t('platform.loadFailed')} /> : companies.length === 0 ? <WorkspaceState kind="empty" message={t('platform.empty')} /> : <ul className="platform-company-list">{companies.map((company) => <li key={company.id}><span className="platform-company-icon"><Building2 size={17} /></span><span className="platform-company-copy"><strong>{company.name}</strong><small>{company.slug}</small></span><span className="platform-company-meta">{t('platform.memberCount', { count: company.memberCount })}</span><time>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(company.createdAt))}</time><Button type="button" className="platform-open-workspace" disabled={changingOrganization} onClick={() => onSelectOrganization(company.id)}>{t('platform.openWorkspace')}<ArrowRight size={15} /></Button></li>)}</ul>}
        {total > 0 && <footer className="platform-pagination"><label>{t('table.rowsPerPage')}<SelectField value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0) }}>{PLATFORM_ORGANIZATION_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</SelectField></label><span>{t('table.range', { from: offset + 1, to: Math.min(offset + pageSize, total), total })}</span><div><Button type="button" disabled={offset === 0 || loading} aria-label={t('common.previousPage')} onClick={() => setOffset((current) => Math.max(0, current - pageSize))}><ChevronLeft size={16} /></Button><Button type="button" disabled={!hasNextPage || loading} aria-label={t('common.nextPage')} onClick={() => setOffset((current) => current + pageSize)}><ChevronRight size={16} /></Button></div></footer>}
      </section>
    </div>
  </main>
}
