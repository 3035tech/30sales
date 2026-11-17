import { Button, IconButton, NumericField, PhoneField, SelectField, TextField } from '../components/ui/FormControls'
import { useEffect, useMemo, useState } from 'react'
import { Activity, Check, Link2, Power, Radio, RefreshCw, Search, Settings2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import { api, CHANNEL_CONNECTION_STATUS, CHANNEL_WEBHOOK_EVENT_STATUS, type ChannelDto, type ChannelHealthCheckDto, type ChannelWebhookEventsPageDto, type CreateChannelInput, type EvolutionInstanceListDto } from '../lib/api'
import './ChannelsWorkspace.css'

type SortKey = 'displayName' | 'provider' | 'phoneNumber' | 'providerChannelId' | 'status' | 'dailyMessageCount'
const emptyForm: CreateChannelInput = { provider: 'evolution', displayName: '', phoneNumber: '', providerChannelId: '', providerAccountId: '' }

export function ChannelsWorkspace() {
  const { t, i18n } = useTranslation()
  const apiBaseUrl = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '')
  const [channels, setChannels] = useState<ChannelDto[]>([])
  const [form, setForm] = useState<CreateChannelInput>(emptyForm)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('displayName')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [quotaChannel, setQuotaChannel] = useState<ChannelDto | null>(null)
  const [quotaLimit, setQuotaLimit] = useState<number | null>(null)
  const [savingQuota, setSavingQuota] = useState(false)
  const [discoveryChannel, setDiscoveryChannel] = useState<ChannelDto | null>(null)
  const [discovery, setDiscovery] = useState<EvolutionInstanceListDto | null>(null)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryError, setDiscoveryError] = useState(false)
  const [credentialsChannelId, setCredentialsChannelId] = useState('')
  const [evolutionBaseUrl, setEvolutionBaseUrl] = useState('')
  const [evolutionApiKey, setEvolutionApiKey] = useState('')
  const [evolutionWebhookSecret, setEvolutionWebhookSecret] = useState('')
  const [cloudAccessToken, setCloudAccessToken] = useState('')
  const [cloudSignalSecret, setCloudSignalSecret] = useState('')
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [healthChecks, setHealthChecks] = useState<Record<string, ChannelHealthCheckDto>>({})
  const [healthCheckErrors, setHealthCheckErrors] = useState<Record<string, boolean>>({})
  const [checkingChannelIds, setCheckingChannelIds] = useState<string[]>([])
  const [configuringWebhookIds, setConfiguringWebhookIds] = useState<string[]>([])
  const [webhookConfiguredAt, setWebhookConfiguredAt] = useState<Record<string, string>>({})
  const [webhookConfigurationErrors, setWebhookConfigurationErrors] = useState<Record<string, boolean>>({})
  const [eventsChannel, setEventsChannel] = useState<ChannelDto | null>(null)
  const [webhookEvents, setWebhookEvents] = useState<ChannelWebhookEventsPageDto | null>(null)
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false)
  const [webhookEventsError, setWebhookEventsError] = useState(false)
  const [webhookEventsOffset, setWebhookEventsOffset] = useState(0)
  const [webhookEventsLimit, setWebhookEventsLimit] = useState(25)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  const clearCredentialForm = () => {
    setCredentialsChannelId('')
    setEvolutionBaseUrl('')
    setEvolutionApiKey('')
    setEvolutionWebhookSecret('')
    setCloudAccessToken('')
    setCloudSignalSecret('')
  }
  const openCredentialForm = (channelId: string) => {
    clearCredentialForm()
    setCredentialsChannelId(channelId)
    setError('')
  }

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    api.channels.list().then((result) => { if (active) setChannels(result) }).catch(() => { if (active) setError(t('channels.loadFailed')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [refresh, t])

  useEffect(() => {
    if (!eventsChannel) return
    let active = true
    setWebhookEventsLoading(true); setWebhookEventsError(false)
    api.channels.webhookEvents(eventsChannel.id, webhookEventsLimit, webhookEventsOffset)
      .then((result) => { if (active) setWebhookEvents(result) })
      .catch(() => { if (active) setWebhookEventsError(true) })
      .finally(() => { if (active) setWebhookEventsLoading(false) })
    return () => { active = false }
  }, [eventsChannel, webhookEventsLimit, webhookEventsOffset])

  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    const filtered = channels.filter((channel) => `${channel.displayName} ${channel.phoneNumber} ${channel.provider} ${channel.providerChannelId} ${channel.providerAccountId ?? ''}`.toLocaleLowerCase().includes(search))
    const direction = sortDirection === 'asc' ? 1 : -1
    return filtered.sort((left, right) => {
      const values: Record<SortKey, [string, string]> = {
        displayName: [left.displayName, right.displayName], provider: [left.provider, right.provider], phoneNumber: [left.phoneNumber, right.phoneNumber], providerChannelId: [left.providerChannelId, right.providerChannelId], status: [`${left.isActive ? '0' : '1'}-${left.isConfigured ? '0' : '1'}-${healthChecks[left.id]?.status ?? 'z'}`, `${right.isActive ? '0' : '1'}-${right.isConfigured ? '0' : '1'}-${healthChecks[right.id]?.status ?? 'z'}`], dailyMessageCount: [String(left.dailyMessageCount).padStart(8, '0'), String(right.dailyMessageCount).padStart(8, '0')],
      }
      return values[sortKey][0].localeCompare(values[sortKey][1]) * direction || left.id.localeCompare(right.id)
    })
  }, [channels, healthChecks, query, sortKey, sortDirection])

  const createChannel = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.channels.create({ ...form, providerAccountId: form.provider === 'whatsapp_cloud_api' ? form.providerAccountId : undefined })
      setForm(emptyForm); setQuery(''); setOffset(0); setRefresh((version) => version + 1)
    } catch { setError(t('channels.saveFailed')) }
    finally { setSaving(false) }
  }
  const updateProvider = (provider: string) => {
    if (provider !== 'evolution' && provider !== 'whatsapp_cloud_api') return
    setForm((current) => ({ ...current, provider }))
  }
  const toggleChannel = async (channel: ChannelDto) => {
    setUpdatingId(channel.id); setError('')
    try { await api.channels.update(channel.id, { isActive: !channel.isActive }); setRefresh((version) => version + 1) }
    catch { setError(t('channels.updateFailed')) }
    finally { setUpdatingId('') }
  }
  const saveQuota = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!quotaChannel || quotaLimit === null) return
    setSavingQuota(true); setError('')
    try { await api.channels.update(quotaChannel.id, { dailyMessageLimit: quotaLimit }); setQuotaChannel(null); setRefresh((version) => version + 1) }
    catch { setError(t('channels.quotaUpdateFailed')) }
    finally { setSavingQuota(false) }
  }
  const discoverInstances = async (channel: ChannelDto) => {
    setDiscoveryChannel(channel); setDiscovery(null); setDiscoveryError(false); setDiscoveryLoading(true)
    try { setDiscovery(await api.channels.discoverEvolutionInstances(channel.id)) }
    catch { setDiscoveryError(true) }
    finally { setDiscoveryLoading(false) }
  }
  const prefillDiscoveredInstance = (instance: NonNullable<EvolutionInstanceListDto['instances'][number]>) => {
    if (!instance.phoneNumber) return
    setForm({ provider: 'evolution', displayName: instance.displayName, phoneNumber: instance.phoneNumber, providerChannelId: instance.instanceName, providerAccountId: '' })
    setDiscoveryChannel(null); setDiscovery(null); setCredentialsChannelId('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const configureCredentials = async (event: React.FormEvent) => {
    event.preventDefault()
    const channel = channels.find((item) => item.id === credentialsChannelId)
    if (!channel) return
    setSavingCredentials(true); setError('')
    try {
      await api.channels.setCredentials(channel.id, channel.provider === 'evolution'
        ? { provider: 'evolution', baseUrl: evolutionBaseUrl, apiKey: evolutionApiKey, webhookSecret: evolutionWebhookSecret }
        : { provider: 'whatsapp_cloud_api', accessToken: cloudAccessToken, signalSecret: cloudSignalSecret })
      setHealthChecks((current) => { const next = { ...current }; delete next[channel.id]; return next })
      setHealthCheckErrors((current) => { const next = { ...current }; delete next[channel.id]; return next })
      clearCredentialForm(); setRefresh((version) => version + 1)
    } catch { setError(t('channels.credentialsFailed')) }
    finally { setSavingCredentials(false) }
  }

  const checkConnection = async (channelId: string) => {
    setCheckingChannelIds((current) => [...current, channelId])
    setHealthChecks((current) => { const next = { ...current }; delete next[channelId]; return next })
    setHealthCheckErrors((current) => ({ ...current, [channelId]: false }))
    try {
      const result = await api.channels.healthCheck(channelId)
      setHealthChecks((current) => ({ ...current, [channelId]: result }))
    } catch {
      setHealthCheckErrors((current) => ({ ...current, [channelId]: true }))
    } finally {
      setCheckingChannelIds((current) => current.filter((id) => id !== channelId))
    }
  }

  const configureEvolutionWebhook = async (channelId: string) => {
    setConfiguringWebhookIds((current) => [...current, channelId])
    setWebhookConfigurationErrors((current) => ({ ...current, [channelId]: false }))
    try {
      const result = await api.channels.configureEvolutionWebhook(channelId)
      setWebhookConfiguredAt((current) => ({ ...current, [channelId]: result.configuredAt }))
    } catch {
      setWebhookConfigurationErrors((current) => ({ ...current, [channelId]: true }))
    } finally {
      setConfiguringWebhookIds((current) => current.filter((id) => id !== channelId))
    }
  }

  const columns: DataTableColumn<ChannelDto, SortKey>[] = [
    { id: 'displayName', label: t('channels.columns.name'), render: (channel) => <div className="channel-name-cell"><Radio size={16} /><strong>{channel.displayName}</strong></div> },
    { id: 'provider', label: t('channels.columns.provider'), render: (channel) => t(`channels.providers.${channel.provider}`) },
    { id: 'phoneNumber', label: t('channels.columns.number'), render: (channel) => channel.phoneNumber },
    { id: 'providerChannelId', label: t('channels.columns.providerId'), render: (channel) => <div className="channel-id-cell"><code>{channel.providerChannelId}</code>{channel.providerAccountId && <small>{t('channels.businessAccount')}: {channel.providerAccountId}</small>}</div> },
    { id: 'dailyMessageCount', label: t('channels.columns.dailyQuota'), render: (channel) => <div className="channel-quota-cell"><strong>{t('channels.quotaUsage', { used: channel.dailyMessageCount, limit: channel.dailyMessageLimit })}</strong><small>{channel.dailyLimitTimeZone}</small><IconButton label={t('channels.editQuota', { name: channel.displayName })} onClick={() => { setQuotaChannel(channel); setQuotaLimit(channel.dailyMessageLimit) }}><Settings2 size={16} /></IconButton></div> },
    { id: 'status', label: t('channels.columns.routing'), render: (channel) => {
      const health = healthChecks[channel.id]
      const checkedAt = health ? new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(health.checkedAt)) : ''
      const checking = checkingChannelIds.includes(channel.id)
      const configuringWebhook = configuringWebhookIds.includes(channel.id)
      const webhookDate = webhookConfiguredAt[channel.id] ? new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(webhookConfiguredAt[channel.id])) : ''
      const connectionDate = channel.connectionUpdatedAt ? new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(channel.connectionUpdatedAt)) : ''
      return <div className="channel-status-cell"><span className={`channel-status ${channel.isActive ? 'active' : ''}`}>{t(channel.isActive ? 'channels.active' : 'channels.disabled')}</span><span className={`channel-status ${channel.isConfigured ? 'active' : ''}`}>{t(channel.isConfigured ? 'channels.configured' : 'channels.notConfigured')}</span>{channel.provider === 'evolution' && channel.connectionStatus && <small className={`channel-health-result ${channel.connectionStatus === CHANNEL_CONNECTION_STATUS.connected ? '' : 'error'}`} role="status">{t(`channels.connection.${channel.connectionStatus}`)}{connectionDate ? ` · ${t('channels.connectionUpdatedAt', { date: connectionDate })}` : ''}</small>}<IconButton label={t('channels.viewEvents', { name: channel.displayName })} onClick={() => { setWebhookEvents(null); setWebhookEventsOffset(0); setEventsChannel(channel) }}><Activity size={16} /></IconButton>{channel.provider === 'evolution' && channel.isConfigured && <><IconButton label={t('channels.discoverInstances', { name: channel.displayName })} onClick={() => void discoverInstances(channel)}><Search size={16} /></IconButton><IconButton label={configuringWebhook ? t('channels.configuringWebhook') : t('channels.configureWebhook')} disabled={configuringWebhook} onClick={() => void configureEvolutionWebhook(channel.id)}><Link2 size={16} /></IconButton></>}{channel.provider === 'evolution' && webhookDate && <small className="channel-health-result" role="status">{t('channels.webhookConfiguredAt', { date: webhookDate })}</small>}{webhookConfigurationErrors[channel.id] && <small className="channel-health-result error" role="status">{t('channels.webhookConfigurationFailed')}</small>}<IconButton label={t('channels.configureCredentials')} onClick={() => openCredentialForm(channel.id)}><Settings2 size={16} /></IconButton><IconButton label={updatingId === channel.id ? t('common.saving') : channel.isActive ? t('channels.disable') : t('channels.enable')} disabled={updatingId === channel.id} onClick={() => void toggleChannel(channel)}><Power size={16} /></IconButton><IconButton label={checking ? t('channels.checkingConnection') : t('channels.checkProvider')} disabled={checking} onClick={() => void checkConnection(channel.id)}><RefreshCw size={16} /></IconButton>{health && <small className="channel-health-result" role="status">{t(`channels.health.${health.status}`)} · {t('channels.healthCheckedAt', { date: checkedAt })}</small>}{healthCheckErrors[channel.id] && <small className="channel-health-result error" role="status">{t('channels.healthCheckFailed')}</small>}</div>
    } },
  ]
  return <section className="channels-page">
    <header className="channels-heading"><div><p className="eyebrow">{t('channels.eyebrow')}</p><h2>{t('channels.title')}</h2><p className="muted">{t('channels.description')}</p></div><Button className="refresh" type="button" onClick={() => setRefresh((version) => version + 1)} aria-label={t('channels.refresh')}><RefreshCw size={16} /></Button></header>
    <Modal open={quotaChannel !== null} onOpenChange={(open) => { if (!open) { setQuotaChannel(null); setQuotaLimit(null) } }} title={t('channels.quotaTitle', { name: quotaChannel?.displayName ?? '' })} description={t('channels.quotaDescription', { timeZone: quotaChannel?.dailyLimitTimeZone ?? '' })} closeLabel={t('common.close')} className="channel-quota-modal">
      <form className="channel-quota-form" onSubmit={(event) => void saveQuota(event)}>
        <p>{t('channels.quotaCurrentUsage', { used: quotaChannel?.dailyMessageCount ?? 0, limit: quotaChannel?.dailyMessageLimit ?? 0 })}</p>
        <label>{t('channels.quotaLimit')}<NumericField mode="integer" min={1} max={5000} value={quotaLimit} onValueChange={setQuotaLimit} required /></label>
        <Button type="submit" variant="primary" disabled={savingQuota || quotaLimit === null}>{savingQuota ? t('common.saving') : t('channels.saveQuota')}</Button>
      </form>
    </Modal>
    <Modal open={discoveryChannel !== null} onOpenChange={(open) => { if (!open) { setDiscoveryChannel(null); setDiscovery(null); setDiscoveryError(false) } }} title={t('channels.discoveryTitle', { name: discoveryChannel?.displayName ?? '' })} description={t('channels.discoveryDescription')} closeLabel={t('common.close')} className="channel-discovery-modal">
      {discoveryLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : discoveryError ? <WorkspaceState kind="error" compact message={t('channels.discoveryFailed')} /> : <div className="channel-discovery-list">
        {discovery?.instances.length ? discovery.instances.map((instance) => {
          const registered = channels.some((channel) => channel.provider === 'evolution' && channel.providerChannelId === instance.instanceName)
          return <article key={instance.instanceName}>
            <div><strong>{instance.displayName}</strong><span>{instance.phoneNumber ?? t('channels.phoneUnavailable')}</span><small>{instance.instanceName} · {t(`channels.health.${instance.status}`)}</small></div>
            {registered ? <span className="channel-status active">{t('channels.instanceRegistered')}</span> : <><span className="channel-status">{t('channels.instanceNotRegistered')}</span><Button type="button" disabled={!instance.phoneNumber} onClick={() => prefillDiscoveredInstance(instance)}>{t('channels.prepareInstance')}</Button></>}
          </article>
        }) : <WorkspaceState kind="empty" compact message={t('channels.discoveryEmpty')} />}
      </div>}
    </Modal>
    <Modal open={eventsChannel !== null} onOpenChange={(open) => { if (!open) { setEventsChannel(null); setWebhookEvents(null); setWebhookEventsOffset(0); setWebhookEventsLimit(25) } }} title={t('channels.eventsTitle', { name: eventsChannel?.displayName ?? '' })} description={t('channels.eventsDescription')} closeLabel={t('common.close')} className="channel-events-modal">
      {webhookEventsLoading && <WorkspaceState kind="loading" compact message={t('common.loading')} />}
      {webhookEventsError && <WorkspaceState kind="error" compact message={t('channels.eventsFailed')} />}
      {!webhookEventsLoading && !webhookEventsError && webhookEvents?.data.length === 0 && <WorkspaceState kind="empty" compact message={t('channels.eventsEmpty')} />}
      {webhookEvents?.data.length ? <div className="channel-events-list" aria-busy={webhookEventsLoading}>{webhookEvents.data.map((event) => <article key={event.id}>
        <div className="channel-event-heading"><strong>{event.eventType}</strong><span className={`channel-status ${event.status === CHANNEL_WEBHOOK_EVENT_STATUS.processed ? 'active' : event.status === CHANNEL_WEBHOOK_EVENT_STATUS.failed ? 'error' : ''}`}>{t(`channels.eventStatus.${event.status}`)}</span></div>
        <div className="channel-event-meta"><span>{t(`channels.providers.${event.provider}`)} · {t(`channels.eventFamily.${event.eventFamily}`)}</span><time dateTime={event.receivedAt}>{new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.receivedAt))}</time></div>
        <small>{t('channels.eventAttempts', { count: event.attempts })}{event.processedAt ? ` · ${t('channels.eventProcessedAt', { date: new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.processedAt)) })}` : ''}</small>
        {event.lastErrorCode && <code>{event.lastErrorCode}</code>}
      </article>)}</div> : null}
      {webhookEvents && webhookEvents.pagination.total > 0 && <div className="channel-events-pagination"><span>{t('table.range', { from: webhookEvents.pagination.offset + 1, to: webhookEvents.pagination.offset + webhookEvents.data.length, total: webhookEvents.pagination.total })}</span><label>{t('table.rowsPerPage')}<SelectField value={webhookEventsLimit} disabled={webhookEventsLoading} onChange={(event) => { setWebhookEventsLimit(Number(event.target.value)); setWebhookEventsOffset(0) }} aria-label={t('table.rowsPerPage')}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</SelectField></label><div><Button type="button" disabled={webhookEventsLoading || webhookEventsOffset === 0} onClick={() => setWebhookEventsOffset((value) => Math.max(0, value - webhookEventsLimit))}>{t('table.previous')}</Button><Button type="button" disabled={webhookEventsLoading || !webhookEvents.pagination.hasNextPage} onClick={() => setWebhookEventsOffset((value) => value + webhookEventsLimit)}>{t('table.next')}</Button></div></div>}
    </Modal>
    <form className="channel-form" onSubmit={createChannel}>
      <div className="channel-form-heading"><Radio size={17} /><div><strong>{t('channels.addTitle')}</strong><small>{t('channels.addHint')}</small></div></div>
      <div className="channel-form-grid">
        <label>{t('channels.provider')}<SelectField value={form.provider} onChange={(event) => updateProvider(event.target.value)}><option value="evolution">{t('channels.providers.evolution')}</option><option value="whatsapp_cloud_api">{t('channels.providers.whatsapp_cloud_api')}</option></SelectField></label>
        <label>{t('channels.name')}<TextField value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} minLength={2} maxLength={120} pattern=".*\S.*" required /></label>
        <label>{t('channels.phone')}<PhoneField requireInternational value={form.phoneNumber} onValueChange={(phoneNumber) => setForm((current) => ({ ...current, phoneNumber }))} placeholder="+55 (11) 99999-9999" required /></label>
        <label>{t(form.provider === 'evolution' ? 'channels.evolutionInstance' : 'channels.phoneNumberId')}<TextField value={form.providerChannelId} onChange={(event) => setForm((current) => ({ ...current, providerChannelId: event.target.value }))} minLength={1} maxLength={200} pattern=".*\S.*" required /></label>
        {form.provider === 'whatsapp_cloud_api' && <label>{t('channels.businessAccount')}<TextField value={form.providerAccountId ?? ''} onChange={(event) => setForm((current) => ({ ...current, providerAccountId: event.target.value }))} minLength={1} maxLength={200} pattern=".*\S.*" required /></label>}
      </div>
      <div className="channel-form-footer"><p>{t('channels.credentialsNote')}</p><Button className="primary" disabled={saving}>{saving ? t('common.saving') : <><Check size={15} />{t('channels.add')}</>}</Button></div>
    </form>
    {credentialsChannelId && (() => { const channel = channels.find((item) => item.id === credentialsChannelId); return channel ? <form className="channel-form channel-credentials-form" onSubmit={configureCredentials}>
      <div className="channel-form-heading"><Radio size={17} /><div><strong>{t('channels.configureTitle', { name: channel.displayName })}</strong><small>{t('channels.credentialsSecurityNote')}</small></div></div>
      <div className="channel-form-grid">
        {channel.provider === 'evolution' ? <><label>{t('channels.evolutionBaseUrl')}<TextField value={evolutionBaseUrl} onChange={(event) => setEvolutionBaseUrl(event.target.value)} type="url" maxLength={2048} placeholder="https://evolution.example.com" required /></label><label>{t('channels.evolutionApiKey')}<TextField value={evolutionApiKey} onChange={(event) => setEvolutionApiKey(event.target.value)} type="password" autoComplete="new-password" maxLength={500} required /></label><label>{t('inboxComposer.evolutionWebhookSecret')}<TextField value={evolutionWebhookSecret} onChange={(event) => setEvolutionWebhookSecret(event.target.value)} type="password" autoComplete="new-password" minLength={32} maxLength={500} required /><small>{t('inboxComposer.evolutionWebhookHint')}</small></label><label>{t('inboxComposer.evolutionWebhookUrl')}<TextField readOnly value={`${apiBaseUrl}/api/v1/webhooks/evolution/${channel.id}`} /></label><label>{t('channels.agentSignalUrl')}<TextField readOnly value={`${apiBaseUrl}/api/v1/webhooks/${channel.id}/agent-signals/interpretation-failure`} /></label></> : <><label>{t('channels.cloudAccessToken')}<TextField value={cloudAccessToken} onChange={(event) => setCloudAccessToken(event.target.value)} type="password" autoComplete="new-password" maxLength={4000} required /></label><label>{t('channels.agentSignalSecret')}<TextField value={cloudSignalSecret} onChange={(event) => setCloudSignalSecret(event.target.value)} type="password" autoComplete="new-password" minLength={32} maxLength={500} required /><small>{t('channels.agentSignalSecretHint')}</small></label><label>{t('inboxComposer.cloudWebhookUrl')}<TextField readOnly value={`${apiBaseUrl}/api/v1/webhooks/whatsapp-cloud`} /></label><label>{t('channels.agentSignalUrl')}<TextField readOnly value={`${apiBaseUrl}/api/v1/webhooks/${channel.id}/agent-signals/interpretation-failure`} /></label></>}
      </div>
      <div className="channel-form-footer"><p>{t('channels.credentialsNeverShown')}</p><Button type="button" onClick={clearCredentialForm}>{t('common.cancel')}</Button><Button className="primary" disabled={savingCredentials}>{savingCredentials ? t('common.saving') : t('channels.saveCredentials')}</Button></div>
    </form> : null })()}
    {error && rows.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    <DataTable rows={rows.slice(offset, offset + limit)} columns={columns} getRowId={(channel) => channel.id} sort={{ key: sortKey, direction: sortDirection }} onSortChange={(key, direction) => { setSortKey(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit, offset, total: rows.length, hasNextPage: offset + limit < rows.length }} onPageChange={setOffset} onPageSizeChange={(size) => { setLimit(size); setOffset(0) }} loading={loading} emptyState={<div><strong>{error || t('channels.empty')}</strong></div>} emptyStateKind={error ? 'error' : 'empty'} filters={<label className="channel-search"><Search size={15} /><TextField value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder={t('channels.search')} aria-label={t('channels.search')} /></label>} />
  </section>
}
