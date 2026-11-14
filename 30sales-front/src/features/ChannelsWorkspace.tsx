import { useEffect, useMemo, useState } from 'react'
import { Check, Radio, RefreshCw, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { api, type ChannelDto, type CreateChannelInput } from '../lib/api/client'
import './ChannelsWorkspace.css'

type SortKey = 'displayName' | 'provider' | 'phoneNumber' | 'providerChannelId' | 'status'
const emptyForm: CreateChannelInput = { provider: 'evolution', displayName: '', phoneNumber: '', providerChannelId: '', providerAccountId: '' }

export function ChannelsWorkspace() {
  const { t } = useTranslation()
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
  const [credentialsChannelId, setCredentialsChannelId] = useState('')
  const [evolutionBaseUrl, setEvolutionBaseUrl] = useState('')
  const [evolutionApiKey, setEvolutionApiKey] = useState('')
  const [cloudAccessToken, setCloudAccessToken] = useState('')
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)

  const clearCredentialForm = () => {
    setCredentialsChannelId('')
    setEvolutionBaseUrl('')
    setEvolutionApiKey('')
    setCloudAccessToken('')
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

  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    const filtered = channels.filter((channel) => `${channel.displayName} ${channel.phoneNumber} ${channel.provider} ${channel.providerChannelId} ${channel.providerAccountId ?? ''}`.toLocaleLowerCase().includes(search))
    const direction = sortDirection === 'asc' ? 1 : -1
    return filtered.sort((left, right) => {
      const values: Record<SortKey, [string, string]> = {
        displayName: [left.displayName, right.displayName], provider: [left.provider, right.provider], phoneNumber: [left.phoneNumber, right.phoneNumber], providerChannelId: [left.providerChannelId, right.providerChannelId], status: [left.isActive ? '1' : '0', right.isActive ? '1' : '0'],
      }
      return values[sortKey][0].localeCompare(values[sortKey][1]) * direction || left.id.localeCompare(right.id)
    })
  }, [channels, query, sortKey, sortDirection])

  const createChannel = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await api.channels.create({ ...form, providerAccountId: form.provider === 'whatsapp_cloud_api' ? form.providerAccountId : undefined })
      setForm(emptyForm); setQuery(''); setOffset(0); setRefresh((version) => version + 1)
    } catch { setError(t('channels.saveFailed')) }
    finally { setSaving(false) }
  }
  const toggleChannel = async (channel: ChannelDto) => {
    setUpdatingId(channel.id); setError('')
    try { await api.channels.update(channel.id, { isActive: !channel.isActive }); setRefresh((version) => version + 1) }
    catch { setError(t('channels.updateFailed')) }
    finally { setUpdatingId('') }
  }
  const configureCredentials = async (event: React.FormEvent) => {
    event.preventDefault()
    const channel = channels.find((item) => item.id === credentialsChannelId)
    if (!channel) return
    setSavingCredentials(true); setError('')
    try {
      await api.channels.setCredentials(channel.id, channel.provider === 'evolution'
        ? { provider: 'evolution', baseUrl: evolutionBaseUrl, apiKey: evolutionApiKey }
        : { provider: 'whatsapp_cloud_api', accessToken: cloudAccessToken })
      clearCredentialForm(); setRefresh((version) => version + 1)
    } catch { setError(t('channels.credentialsFailed')) }
    finally { setSavingCredentials(false) }
  }

  const columns: DataTableColumn<ChannelDto, SortKey>[] = [
    { id: 'displayName', label: t('channels.columns.name'), render: (channel) => <div className="channel-name-cell"><Radio size={16} /><strong>{channel.displayName}</strong></div> },
    { id: 'provider', label: t('channels.columns.provider'), render: (channel) => t(`channels.providers.${channel.provider}`) },
    { id: 'phoneNumber', label: t('channels.columns.number'), render: (channel) => channel.phoneNumber },
    { id: 'providerChannelId', label: t('channels.columns.providerId'), render: (channel) => <div className="channel-id-cell"><code>{channel.providerChannelId}</code>{channel.providerAccountId && <small>{t('channels.businessAccount')}: {channel.providerAccountId}</small>}</div> },
    { id: 'status', label: t('channels.columns.routing'), render: (channel) => <div className="channel-status-cell"><span className={`channel-status ${channel.isActive ? 'active' : ''}`}>{t(channel.isActive ? 'channels.active' : 'channels.disabled')}</span><span className={`channel-status ${channel.isConfigured ? 'active' : ''}`}>{t(channel.isConfigured ? 'channels.configured' : 'channels.notConfigured')}</span><button type="button" onClick={() => openCredentialForm(channel.id)}>{t('channels.configureCredentials')}</button><button type="button" disabled={updatingId === channel.id} onClick={() => void toggleChannel(channel)}>{updatingId === channel.id ? t('common.saving') : channel.isActive ? t('channels.disable') : t('channels.enable')}</button></div> },
  ]
  return <section className="channels-page">
    <header className="channels-heading"><div><p className="eyebrow">{t('channels.eyebrow')}</p><h2>{t('channels.title')}</h2><p className="muted">{t('channels.description')}</p></div><button className="refresh" type="button" onClick={() => setRefresh((version) => version + 1)} aria-label={t('channels.refresh')}><RefreshCw size={16} /></button></header>
    <form className="channel-form" onSubmit={createChannel}>
      <div className="channel-form-heading"><Radio size={17} /><div><strong>{t('channels.addTitle')}</strong><small>{t('channels.addHint')}</small></div></div>
      <div className="channel-form-grid">
        <label>{t('channels.provider')}<select value={form.provider} onChange={(event) => setForm((current) => ({ ...current, provider: event.target.value as CreateChannelInput['provider'] }))}><option value="evolution">{t('channels.providers.evolution')}</option><option value="whatsapp_cloud_api">{t('channels.providers.whatsapp_cloud_api')}</option></select></label>
        <label>{t('channels.name')}<input value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} maxLength={120} required /></label>
        <label>{t('channels.phone')}<input value={form.phoneNumber} onChange={(event) => setForm((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="+5511999999999" pattern="\+[1-9][0-9]{7,14}" required /></label>
        <label>{t(form.provider === 'evolution' ? 'channels.evolutionInstance' : 'channels.phoneNumberId')}<input value={form.providerChannelId} onChange={(event) => setForm((current) => ({ ...current, providerChannelId: event.target.value }))} maxLength={200} required /></label>
        {form.provider === 'whatsapp_cloud_api' && <label>{t('channels.businessAccount')}<input value={form.providerAccountId ?? ''} onChange={(event) => setForm((current) => ({ ...current, providerAccountId: event.target.value }))} maxLength={200} required /></label>}
      </div>
      <div className="channel-form-footer"><p>{t('channels.credentialsNote')}</p><button className="primary" disabled={saving}>{saving ? t('common.saving') : <><Check size={15} />{t('channels.add')}</>}</button></div>
    </form>
    {credentialsChannelId && (() => { const channel = channels.find((item) => item.id === credentialsChannelId); return channel ? <form className="channel-form channel-credentials-form" onSubmit={configureCredentials}>
      <div className="channel-form-heading"><Radio size={17} /><div><strong>{t('channels.configureTitle', { name: channel.displayName })}</strong><small>{t('channels.credentialsSecurityNote')}</small></div></div>
      <div className="channel-form-grid">
        {channel.provider === 'evolution' ? <><label>{t('channels.evolutionBaseUrl')}<input value={evolutionBaseUrl} onChange={(event) => setEvolutionBaseUrl(event.target.value)} type="url" placeholder="https://evolution.example.com" required /></label><label>{t('channels.evolutionApiKey')}<input value={evolutionApiKey} onChange={(event) => setEvolutionApiKey(event.target.value)} type="password" autoComplete="new-password" required /></label></> : <label>{t('channels.cloudAccessToken')}<input value={cloudAccessToken} onChange={(event) => setCloudAccessToken(event.target.value)} type="password" autoComplete="new-password" required /></label>}
      </div>
      <div className="channel-form-footer"><p>{t('channels.credentialsNeverShown')}</p><button type="button" onClick={clearCredentialForm}>{t('common.cancel')}</button><button className="primary" disabled={savingCredentials}>{savingCredentials ? t('common.saving') : t('channels.saveCredentials')}</button></div>
    </form> : null })()}
    {error && <p className="error" role="alert">{error}</p>}
    <DataTable rows={rows.slice(offset, offset + limit)} columns={columns} getRowId={(channel) => channel.id} sort={{ key: sortKey, direction: sortDirection }} onSortChange={(key, direction) => { setSortKey(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit, offset, total: rows.length, hasNextPage: offset + limit < rows.length }} onPageChange={setOffset} onPageSizeChange={(size) => { setLimit(size); setOffset(0) }} loading={loading} emptyState={<div><strong>{error || t('channels.empty')}</strong></div>} filters={<label className="channel-search"><Search size={15} /><input value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder={t('channels.search')} aria-label={t('channels.search')} /></label>} />
  </section>
}
