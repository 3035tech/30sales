import { Button, SelectField, TextField } from '../components/ui/FormControls'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { useEffect, useState } from 'react'
import { Activity, ArrowRight, Building2, ChevronLeft, ChevronRight, Copy, LogOut, Plus, RefreshCw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ApiError, api, type CreatePlatformOrganizationInput, type PlatformAuditEventDto, type PlatformOrganizationDto, type SessionDto } from '../lib/api'
import { ORGANIZATION_SLUG_PATTERN, PLATFORM_ERROR_CODE, PLATFORM_EVOLUTION_CHECK_ERROR, PLATFORM_EVOLUTION_CHECK_SOURCE, PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE, PLATFORM_ORGANIZATION_PAGE_SIZES, PLATFORM_SEARCH_DEBOUNCE_MILLISECONDS } from '../lib/authorizationConstants'
import { PlatformOrganizationPicker } from './PlatformOrganizationPicker'
import { PlatformAiUsagePanel } from './PlatformAiUsagePanel'
import './PlatformWorkspace.css'

type PlatformTab = 'companies' | 'create' | 'integrations' | 'aiUsage'


function slugFromName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

function formatEvolutionAuditState(state: Record<string, unknown> | null) {
  return [state?.displayName, state?.baseUrl].filter((value): value is string => typeof value === 'string').join(' · ')
}

export function PlatformWorkspace({ user, organizations, activeOrganizationId, activeOrganizationName, platformOrganizationContext, onSignOut, onOpenOrganization, onSelectOrganization }: { user: SessionDto['user']; organizations: SessionDto['organizations']; activeOrganizationId: string | null; activeOrganizationName: string; platformOrganizationContext: boolean; onSignOut: () => Promise<void>; onOpenOrganization: (organizationId: string) => void; onSelectOrganization: (organizationId: string) => Promise<boolean> }) {
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
  const [activeTab, setActiveTab] = useState<PlatformTab>('companies')
  const [evolutionConfiguration, setEvolutionConfiguration] = useState<{ configured: boolean; displayName: string | null; baseUrl: string | null; updatedAt: string | null } | null>(null)
  const [evolutionDisplayName, setEvolutionDisplayName] = useState('Evolution principal')
  const [evolutionBaseUrl, setEvolutionBaseUrl] = useState('')
  const [evolutionApiKey, setEvolutionApiKey] = useState('')
  const [evolutionSaving, setEvolutionSaving] = useState(false)
  const [evolutionError, setEvolutionError] = useState<'load' | 'save' | 'encryption' | null>(null)
  const [evolutionSaved, setEvolutionSaved] = useState(false)
  const [evolutionChecking, setEvolutionChecking] = useState(false)
  const [evolutionCheckResult, setEvolutionCheckResult] = useState<{ instanceCount: number; checkedAt: string } | null>(null)
  const [evolutionCheckError, setEvolutionCheckError] = useState<'configuration' | 'encryption' | 'credentials' | 'endpoint' | 'target' | 'unavailable' | 'timeout' | 'requestFailed' | 'invalidResponse' | null>(null)
  const [evolutionCheckHttpStatus, setEvolutionCheckHttpStatus] = useState<number | null>(null)
  const [evolutionConfigRefresh, setEvolutionConfigRefresh] = useState(0)
  const [evolutionAudit, setEvolutionAudit] = useState<PlatformAuditEventDto[]>([])
  const [evolutionAuditError, setEvolutionAuditError] = useState(false)
  const [evolutionAuditLoading, setEvolutionAuditLoading] = useState(true)

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

  useEffect(() => {
    let active = true
    setEvolutionConfiguration(null)
    setEvolutionError(null)
    setEvolutionAuditLoading(true)
    setEvolutionAuditError(false)
    api.platform.evolutionConfiguration().then((result) => { if (active) { setEvolutionConfiguration(result); setEvolutionDisplayName(result.displayName ?? 'Evolution principal'); setEvolutionBaseUrl(result.baseUrl ?? '') } }).catch(() => { if (active) setEvolutionError('load') })
    api.platform.evolutionAudit().then((result) => { if (active) setEvolutionAudit(result) }).catch(() => { if (active) setEvolutionAuditError(true) }).finally(() => { if (active) setEvolutionAuditLoading(false) })
    return () => { active = false }
  }, [evolutionConfigRefresh])

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

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const tabs: PlatformTab[] = ['companies', 'create', 'integrations', 'aiUsage']
    const currentIndex = tabs.indexOf(activeTab)
    const nextTab = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : tabs[(currentIndex + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
    setActiveTab(nextTab)
    document.getElementById(`platform-tab-${nextTab}`)?.focus()
  }

  const saveEvolutionConfiguration = async (event: React.FormEvent) => {
    event.preventDefault(); setEvolutionSaving(true); setEvolutionError(null); setEvolutionSaved(false); setEvolutionCheckResult(null); setEvolutionCheckError(null)
    try {
      const result = await api.platform.saveEvolutionConfiguration({ displayName: evolutionDisplayName.trim(), baseUrl: evolutionBaseUrl.trim(), apiKey: evolutionApiKey.trim() })
      setEvolutionConfiguration(result); setEvolutionApiKey(''); setEvolutionSaved(true); setEvolutionConfigRefresh((version) => version + 1)
    } catch (caught) { setEvolutionError(caught instanceof ApiError && ['CHANNEL_CREDENTIALS_KEY_MISSING', 'CHANNEL_CREDENTIALS_KEY_INVALID'].includes(caught.code) ? 'encryption' : 'save') }
    finally { setEvolutionSaving(false) }
  }

  const checkEvolutionConfiguration = async (source: typeof PLATFORM_EVOLUTION_CHECK_SOURCE[keyof typeof PLATFORM_EVOLUTION_CHECK_SOURCE]) => {
    setEvolutionChecking(true); setEvolutionCheckResult(null); setEvolutionCheckError(null); setEvolutionCheckHttpStatus(null)
    try {
      const result = await api.platform.checkEvolutionConfiguration(source === PLATFORM_EVOLUTION_CHECK_SOURCE.entered
        ? { baseUrl: evolutionBaseUrl.trim(), apiKey: evolutionApiKey.trim() }
        : {})
      setEvolutionCheckResult({ instanceCount: result.instanceCount, checkedAt: result.checkedAt })
    } catch (caught) {
      const code = caught instanceof ApiError ? caught.code : null
      if (code === PLATFORM_EVOLUTION_CHECK_ERROR.encryptionMissing || code === PLATFORM_EVOLUTION_CHECK_ERROR.encryptionInvalid) setEvolutionCheckError('encryption')
      else if (code === PLATFORM_EVOLUTION_CHECK_ERROR.notConfigured || code === PLATFORM_EVOLUTION_CHECK_ERROR.configurationInvalid) setEvolutionCheckError('configuration')
      else if (code === PLATFORM_EVOLUTION_CHECK_ERROR.keyRejected) setEvolutionCheckError('credentials')
      else if (code === PLATFORM_EVOLUTION_CHECK_ERROR.endpointNotFound) setEvolutionCheckError('endpoint')
      else if (code === PLATFORM_EVOLUTION_CHECK_ERROR.targetBlocked) setEvolutionCheckError('target')
      else if (code === PLATFORM_EVOLUTION_CHECK_ERROR.timeout) setEvolutionCheckError('timeout')
      else if (code === PLATFORM_EVOLUTION_CHECK_ERROR.requestFailed) {
        setEvolutionCheckError('requestFailed')
        if (caught instanceof ApiError) setEvolutionCheckHttpStatus(Number(/HTTP (\d{3})/.exec(caught.message)?.[1]) || null)
      } else if (code === PLATFORM_EVOLUTION_CHECK_ERROR.invalidResponse) setEvolutionCheckError('invalidResponse')
      else setEvolutionCheckError('unavailable')
    } finally { setEvolutionChecking(false) }
  }

  const hasEvolutionCredentialsToTest = Boolean(evolutionBaseUrl.trim() && evolutionApiKey.trim())

  return <main className="platform-shell">
    <header className="platform-topbar"><img src="/brand-kit/logos/logo-default.svg" alt="30Sales" /><div className="platform-user"><PlatformOrganizationPicker activeOrganizationId={activeOrganizationId} activeOrganizationName={activeOrganizationName} platformOrganizationContext={platformOrganizationContext} disabled={false} onSelectOrganization={onSelectOrganization} /><span className="avatar">{user.name.slice(0, 1)}</span><span><strong>{user.name}</strong><small>{user.email}</small></span><Button type="button" className="platform-signout" disabled={signingOut} onClick={() => void signOut()}><LogOut size={16} />{t('platform.signOut')}</Button></div></header>
    <div className="platform-content">
      <header className="platform-heading"><div><p className="eyebrow">{t('platform.eyebrow')}</p><h1>{t('platform.title')}</h1><p>{t('platform.description')}</p></div><Button className="refresh" type="button" aria-label={t('platform.refresh')} onClick={() => setRefreshVersion((current) => current + 1)}><RefreshCw size={16} /></Button></header>
      <div className="platform-tabs" role="tablist" aria-label={t('platform.sections')}>
        <Button type="button" role="tab" id="platform-tab-companies" aria-controls="platform-panel-companies" aria-selected={activeTab === 'companies'} tabIndex={activeTab === 'companies' ? 0 : -1} className={activeTab === 'companies' ? 'selected' : ''} onKeyDown={handleTabKeyDown} onClick={() => setActiveTab('companies')}>{t('platform.companiesTab')}</Button>
        <Button type="button" role="tab" id="platform-tab-create" aria-controls="platform-panel-create" aria-selected={activeTab === 'create'} tabIndex={activeTab === 'create' ? 0 : -1} className={activeTab === 'create' ? 'selected' : ''} onKeyDown={handleTabKeyDown} onClick={() => setActiveTab('create')}><Plus size={15} aria-hidden="true" />{t('platform.createTab')}</Button>
        <Button type="button" role="tab" id="platform-tab-integrations" aria-controls="platform-panel-integrations" aria-selected={activeTab === 'integrations'} tabIndex={activeTab === 'integrations' ? 0 : -1} className={activeTab === 'integrations' ? 'selected' : ''} onKeyDown={handleTabKeyDown} onClick={() => setActiveTab('integrations')}>{t('platform.integrationsTab')}</Button>
        <Button type="button" role="tab" id="platform-tab-aiUsage" aria-controls="platform-panel-aiUsage" aria-selected={activeTab === 'aiUsage'} tabIndex={activeTab === 'aiUsage' ? 0 : -1} className={activeTab === 'aiUsage' ? 'selected' : ''} onKeyDown={handleTabKeyDown} onClick={() => setActiveTab('aiUsage')}><Activity size={15} aria-hidden="true" />{t('platformAiUsage.tab')}</Button>
      </div>
      <div role="tabpanel" id="platform-panel-aiUsage" aria-labelledby="platform-tab-aiUsage" hidden={activeTab !== 'aiUsage'}>{activeTab === 'aiUsage' && <PlatformAiUsagePanel />}</div>
      <div role="tabpanel" id="platform-panel-integrations" aria-labelledby="platform-tab-integrations" hidden={activeTab !== 'integrations'}>
        <section className="platform-panel platform-create-panel">
          <div className="platform-panel-heading"><span className="card-icon"><Building2 size={18} /></span><div><h2>{t('platform.evolutionSettingsTitle')}</h2><p>{t('platform.evolutionSettingsHint')}</p></div></div>
          {evolutionConfiguration && <p className={`platform-evolution-status ${evolutionConfiguration.configured ? 'configured' : 'missing'}`} role="status">{evolutionConfiguration.configured ? t('platform.evolutionConfigured') : t('platform.evolutionNotConfigured')}</p>}
          <form className="platform-company-form" onSubmit={(event) => void saveEvolutionConfiguration(event)}>
            <label>{t('platform.evolutionName')}<TextField value={evolutionDisplayName} onChange={(event) => setEvolutionDisplayName(event.target.value)} maxLength={100} required disabled={!evolutionConfiguration || evolutionSaving} /></label>
            <label>{t('channels.evolutionBaseUrl')}<TextField type="url" value={evolutionBaseUrl} onChange={(event) => { setEvolutionBaseUrl(event.target.value); setEvolutionCheckResult(null); setEvolutionCheckError(null) }} maxLength={2048} placeholder="https://evolution.example.com" required disabled={!evolutionConfiguration || evolutionSaving} /></label>
            <label>{t('platform.evolutionKey')}<TextField type="password" value={evolutionApiKey} onChange={(event) => { setEvolutionApiKey(event.target.value); setEvolutionCheckResult(null); setEvolutionCheckError(null) }} autoComplete="new-password" maxLength={500} required hint={t('platform.evolutionKeyHint')} disabled={!evolutionConfiguration || evolutionSaving} /></label>
            <Button className="primary" disabled={!evolutionConfiguration || evolutionSaving}>{evolutionSaving ? t('common.saving') : t('platform.evolutionSave')}</Button>
          </form>
          <div className="platform-evolution-check-row"><div><div className="platform-evolution-check-actions"><Button type="button" disabled={!hasEvolutionCredentialsToTest || evolutionChecking || evolutionSaving} onClick={() => void checkEvolutionConfiguration(PLATFORM_EVOLUTION_CHECK_SOURCE.entered)}>{evolutionChecking ? t('platform.evolutionChecking') : t('platform.evolutionTestEntered')}</Button><Button type="button" disabled={!evolutionConfiguration?.configured || evolutionChecking || evolutionSaving} onClick={() => void checkEvolutionConfiguration(PLATFORM_EVOLUTION_CHECK_SOURCE.saved)}>{evolutionChecking ? t('platform.evolutionChecking') : t('platform.evolutionCheck')}</Button></div><small>{t('platform.evolutionCheckHint')}</small></div>{evolutionCheckResult && <p className="platform-evolution-success" role="status">{t('platform.evolutionCheckSuccess', { count: evolutionCheckResult.instanceCount, date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(evolutionCheckResult.checkedAt)) })}</p>}</div>
          {evolutionCheckError && <WorkspaceState kind="error" compact message={t(evolutionCheckError === 'encryption' ? 'platform.evolutionEncryptionUnavailable' : evolutionCheckError === 'configuration' ? 'platform.evolutionCheckConfigurationFailed' : evolutionCheckError === 'credentials' ? 'platform.evolutionCheckCredentialsRejected' : evolutionCheckError === 'endpoint' ? 'platform.evolutionCheckEndpointNotFound' : evolutionCheckError === 'target' ? 'platform.evolutionCheckTargetBlocked' : evolutionCheckError === 'timeout' ? 'platform.evolutionCheckTimeout' : evolutionCheckError === 'requestFailed' && evolutionCheckHttpStatus ? 'platform.evolutionCheckRequestFailed' : evolutionCheckError === 'invalidResponse' ? 'platform.evolutionCheckInvalidResponse' : 'platform.evolutionCheckFailed', evolutionCheckHttpStatus ? { status: evolutionCheckHttpStatus } : {})} />}
          {evolutionError && <><WorkspaceState kind="error" compact message={t(evolutionError === 'load' ? 'platform.evolutionLoadFailed' : evolutionError === 'encryption' ? 'platform.evolutionEncryptionUnavailable' : 'platform.evolutionSaveFailed')} />{evolutionError === 'load' && <Button type="button" onClick={() => setEvolutionConfigRefresh((version) => version + 1)}>{t('platform.retry')}</Button>}</>}
          {evolutionSaved && <p className="platform-evolution-success" role="status">{t('platform.evolutionSaved')}</p>}
          {!evolutionConfiguration && !evolutionError && <WorkspaceState kind="loading" compact message={t('common.loading')} />}
          <section className="platform-audit-history" aria-labelledby="platform-evolution-audit-title">
            <h3 id="platform-evolution-audit-title">{t('platformAudit.history')}</h3>
            {evolutionAuditLoading && <WorkspaceState kind="loading" compact message={t('common.loading')} />}
            {evolutionAuditError && <><WorkspaceState kind="error" compact message={t('platformAudit.loadFailed')} /><Button type="button" onClick={() => setEvolutionConfigRefresh((version) => version + 1)}>{t('platform.retry')}</Button></>}
            {!evolutionAuditLoading && !evolutionAuditError && evolutionAudit.length === 0 && <p>{t('platformAudit.empty')}</p>}
            {!evolutionAuditError && evolutionAudit.length > 0 && <ol>{evolutionAudit.map((event) => <li key={event.id}>
              <div><strong>{event.actorName ?? '—'}</strong><span>{t('platformAudit.updated')}</span></div>
              <time dateTime={event.occurredAt}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.occurredAt))}</time>
              <small>{event.beforeState ? `${formatEvolutionAuditState(event.beforeState)} → ` : ''}{formatEvolutionAuditState(event.afterState)}</small>
            </li>)}</ol>}
          </section>
        </section>
      </div>
      <div role="tabpanel" id="platform-panel-companies" aria-labelledby="platform-tab-companies" hidden={activeTab !== 'companies'}>
      <section className="platform-panel platform-workspaces-panel">
        <div className="platform-companies-heading"><div><h2>{t('platform.yourWorkspaces')}</h2><p>{t('platform.yourWorkspacesHint')}</p></div></div>
        {organizations.length === 0
          ? <WorkspaceState kind="empty" compact message={t('platform.noWorkspaceMembership')} detail={t('platform.noWorkspaceMembershipHint')}>{invitationBelongsToCurrentUser && invitationUrl && <a className="platform-accept-invitation" href={invitationUrl}>{t('platform.acceptInvitation')}<ArrowRight size={15} aria-hidden="true" /></a>}</WorkspaceState>
          : <ul className="platform-company-list">{organizations.map((organization) => <li key={organization.id}><span className="platform-company-icon"><Building2 size={17} /></span><span className="platform-company-copy"><strong>{organization.name}</strong><small>{organization.slug}</small></span><Button type="button" className="platform-open-workspace" onClick={() => onOpenOrganization(organization.id)}>{t('platform.openWorkspace')}<ArrowRight size={15} /></Button></li>)}</ul>}
      </section>
      <section className="platform-panel platform-companies-panel">
        <div className="platform-companies-heading"><div><h2>{t('platform.companies')}</h2><p>{t('platform.companyCount', { count: total })}</p></div><label className="platform-search"><Search size={16} /><TextField type="search" value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder={t('platform.searchHint')} aria-label={t('platform.search')} /></label></div>
        {loadError && companies.length > 0 && <WorkspaceState kind="error" compact message={t('platform.loadFailed')} detail={t('table.resultsRetained')} />}
        {loading && companies.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : loadError && companies.length === 0 ? <WorkspaceState kind="error" message={t('platform.loadFailed')} /> : companies.length === 0 ? <WorkspaceState kind="empty" message={t('platform.empty')} /> : <ul className="platform-company-list">{companies.map((company) => <li key={company.id}><span className="platform-company-icon"><Building2 size={17} /></span><span className="platform-company-copy"><strong>{company.name}</strong><small>{company.slug}</small></span><span className="platform-company-meta">{t('platform.memberCount', { count: company.memberCount })}</span><time>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(company.createdAt))}</time><Button type="button" className="platform-open-workspace" onClick={() => onSelectOrganization(company.id)}>{t('platform.openWorkspace')}<ArrowRight size={15} /></Button></li>)}</ul>}
        {total > 0 && <footer className="platform-pagination"><label>{t('table.rowsPerPage')}<SelectField value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0) }}>{PLATFORM_ORGANIZATION_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</SelectField></label><span>{t('table.range', { from: offset + 1, to: Math.min(offset + pageSize, total), total })}</span><div><Button type="button" disabled={offset === 0 || loading} aria-label={t('common.previousPage')} onClick={() => setOffset((current) => Math.max(0, current - pageSize))}><ChevronLeft size={16} /></Button><Button type="button" disabled={!hasNextPage || loading} aria-label={t('common.nextPage')} onClick={() => setOffset((current) => current + pageSize)}><ChevronRight size={16} /></Button></div></footer>}
      </section>
      </div>
      <div role="tabpanel" id="platform-panel-create" aria-labelledby="platform-tab-create" hidden={activeTab !== 'create'}>
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
      </div>
    </div>
  </main>
}
