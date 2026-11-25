import { Button, CheckboxField, IconButton, NumericField, SelectField, TextField } from '../components/ui/FormControls'
import { PhoneField } from '../components/ui/PhoneField'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, CalendarClock, Check, ChevronLeft, ChevronRight, Link2, Plus, Power, QrCode, RefreshCw, RotateCcw, Search, Settings2, ShieldCheck, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { notifySystemAlert, SYSTEM_ALERT_KIND } from '../components/ui/SystemAlert'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { CHANNEL_PROVIDER, CHANNEL_WEBHOOK_EVENT, CHANNEL_WEBHOOK_EVENT_RETRY_ERROR, EVOLUTION_WEBHOOK_CONFIGURATION_STATUS } from '../lib/channelConstants'
import { ApiError, api, CHANNEL_CONNECTION_STATUS, CHANNEL_WEBHOOK_EVENT_FAMILIES, CHANNEL_WEBHOOK_EVENT_STATUS, type ChannelDto, type ChannelHealthCheckDto, type ChannelMonitoringCheckDto, type ChannelWebhookEventFamily, type ChannelWebhookEventStatus, type ChannelWebhookEventsPageDto, type CreateChannelInput, type EvolutionInstanceListDto } from '../lib/api'
import './ChannelsWorkspace.css'

type SortKey = 'displayName' | 'businessLine' | 'provider' | 'phoneNumber' | 'status' | 'dailyMessageCount'
type ChannelsView = 'channels' | 'monitoring'
function parseChannelOperationMode(value: string): ChannelDto['operationMode'] | null { return value === 'inbound' || value === 'outbound' || value === 'hybrid' ? value : null }
function parseAssistantScheduleMode(value: string): ChannelDto['assistantScheduleMode'] | null { return value === 'always' || value === 'business_hours' || value === 'after_hours' || value === 'disabled' ? value : null }
const MONITORING_CHECK_INTERVAL_MS = 60_000
const MONITORING_CHECK_BATCH_SIZE = 20
const MONITORING_SIGNAL_STALE_MS = 5 * 60_000
const PAIRING_STATUS_POLL_INTERVAL_MS = 4_000
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const
type EditableBusinessHour = { dayOfWeek: number; enabled: boolean; startTime: string; endTime: string }
type EditableExceptionDay = { dayOfWeek: number; selected: boolean; assistantEnabled: boolean; allDay: boolean; startTime: string; endTime: string; endDayOfWeek: number; rangeTouched: boolean }
const defaultExceptionDays = (): EditableExceptionDay[] => WEEKDAYS.map((dayOfWeek) => ({ dayOfWeek, selected: dayOfWeek >= 1 && dayOfWeek <= 5, assistantEnabled: true, allDay: false, startTime: '09:00', endTime: '18:00', endDayOfWeek: dayOfWeek, rangeTouched: false }))

function formatExceptionEndDay(localDate: string, offset: number, locale: string): string {
  const endDate = new Date(Date.parse(`${localDate}T00:00:00.000Z`) + offset * 86_400_000)
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(endDate)
}

function hasInvalidExceptionWindow(day: EditableExceptionDay): boolean {
  return day.selected && day.assistantEnabled && !day.allDay && day.endDayOfWeek === day.dayOfWeek && day.startTime >= day.endTime
}
const emptyForm: CreateChannelInput = { businessLineId: '', provider: 'evolution', displayName: '', phoneNumber: '', providerChannelId: '', providerAccountId: '' }

function WhatsAppMark({ size = 18 }: { size?: number }) {
  return <svg className="whatsapp-mark" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.273.297-1.04 1.016-1.04 2.479s1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.693.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.832 9.832 0 0 1-1.51-5.26c.002-5.45 4.436-9.884 9.89-9.884 2.64 0 5.122 1.03 6.985 2.897a9.825 9.825 0 0 1 2.89 6.99c-.003 5.45-4.437 9.889-9.882 9.889m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.893c-.001 2.096.547 4.142 1.588 5.946L.057 24l6.304-1.654a11.882 11.882 0 0 0 5.684 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 0 0-3.479-8.413Z" /></svg>
}

function toMonitoringConnectionStatus(liveStatus: ChannelMonitoringCheckDto['data'][number]['status'] | undefined, persistedStatus: ChannelDto['connectionStatus']) {
  if (liveStatus === undefined) return persistedStatus ?? CHANNEL_CONNECTION_STATUS.unknown
  return liveStatus === CHANNEL_CONNECTION_STATUS.connected || liveStatus === CHANNEL_CONNECTION_STATUS.connecting || liveStatus === CHANNEL_CONNECTION_STATUS.disconnected
    ? liveStatus
    : CHANNEL_CONNECTION_STATUS.unknown
}

export function ChannelsWorkspace() {
  const { t, i18n } = useTranslation()
  const [searchParams] = useSearchParams()
  const businessLineId = searchParams.get('businessLineId') ?? undefined
  const apiBaseUrl = (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/+$/, '')
  const [channels, setChannels] = useState<ChannelDto[]>([])
  const [businessLines, setBusinessLines] = useState<Awaited<ReturnType<typeof api.businessLines.list>>['data']>([])
  const [assistantProfiles, setAssistantProfiles] = useState<Record<string, Awaited<ReturnType<typeof api.agents.listAssistantProfiles>>>>({})
  const [form, setForm] = useState<CreateChannelInput>(emptyForm)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('displayName')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingId, setUpdatingId] = useState('')
  const [deletingId, setDeletingId] = useState('')
  const [channelToDelete, setChannelToDelete] = useState<ChannelDto | null>(null)
  const [quotaChannel, setQuotaChannel] = useState<ChannelDto | null>(null)
  const [quotaLimit, setQuotaLimit] = useState<number | null>(null)
  const [savingQuota, setSavingQuota] = useState(false)
  const [policyChannel, setPolicyChannel] = useState<ChannelDto | null>(null)
  const [policyMode, setPolicyMode] = useState<ChannelDto['operationMode']>('hybrid')
  const [assistantScheduleMode, setAssistantScheduleMode] = useState<ChannelDto['assistantScheduleMode']>('always')
  const [policyTimeZone, setPolicyTimeZone] = useState('America/Sao_Paulo')
  const [policyHours, setPolicyHours] = useState<EditableBusinessHour[]>([])
  const [policyAllDay, setPolicyAllDay] = useState(true)
  const [savingPolicy, setSavingPolicy] = useState(false)
  const [scheduleExceptionChannel, setScheduleExceptionChannel] = useState<ChannelDto | null>(null)
  const [exceptionFromDate, setExceptionFromDate] = useState('')
  const [exceptionToDate, setExceptionToDate] = useState('')
  const [exceptionDays, setExceptionDays] = useState<EditableExceptionDay[]>(defaultExceptionDays)
  const [savingException, setSavingException] = useState(false)
  const [exceptionError, setExceptionError] = useState(false)
  const [discoveryChannel, setDiscoveryChannel] = useState<ChannelDto | null>(null)
  const [discovery, setDiscovery] = useState<EvolutionInstanceListDto | null>(null)
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryError, setDiscoveryError] = useState(false)
  const [connectionChannel, setConnectionChannel] = useState<ChannelDto | null>(null)
  const [connectionResult, setConnectionResult] = useState<Awaited<ReturnType<typeof api.channels.connectEvolution>> | null>(null)
  const [connectionLoading, setConnectionLoading] = useState(false)
  const [connectionError, setConnectionError] = useState(false)
  const pairingRequestId = useRef(0)
  const [credentialsChannelId, setCredentialsChannelId] = useState('')
  const [cloudAccessToken, setCloudAccessToken] = useState('')
  const [cloudSignalSecret, setCloudSignalSecret] = useState('')
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [healthChecks, setHealthChecks] = useState<Record<string, ChannelHealthCheckDto>>({})
  const [healthCheckErrors, setHealthCheckErrors] = useState<Record<string, boolean>>({})
  const [monitoringChecks, setMonitoringChecks] = useState<Record<string, ChannelMonitoringCheckDto['data'][number]>>({})
  const [monitoringCheckErrors, setMonitoringCheckErrors] = useState<Record<string, boolean>>({})
  const [monitoringChecking, setMonitoringChecking] = useState(false)
  const monitoringCheckInFlight = useRef(false)
  const [checkingChannelIds, setCheckingChannelIds] = useState<string[]>([])
  const [configuringWebhookIds, setConfiguringWebhookIds] = useState<string[]>([])
  const [eventsChannel, setEventsChannel] = useState<ChannelDto | null>(null)
  const [webhookEvents, setWebhookEvents] = useState<ChannelWebhookEventsPageDto | null>(null)
  const [mediaHealth, setMediaHealth] = useState<Awaited<ReturnType<typeof api.channels.mediaHealth>> | null>(null)
  const [mediaHealthRefresh, setMediaHealthRefresh] = useState(0)
  const [mediaHealthLoading, setMediaHealthLoading] = useState(false)
  const [mediaHealthError, setMediaHealthError] = useState(false)
  const [webhookEventsLoading, setWebhookEventsLoading] = useState(false)
  const [webhookEventsError, setWebhookEventsError] = useState(false)
  const [webhookEventsOffset, setWebhookEventsOffset] = useState(0)
  const [webhookEventsLimit, setWebhookEventsLimit] = useState(25)
  const [webhookEventsRefresh, setWebhookEventsRefresh] = useState(0)
  const [retryingWebhookEventId, setRetryingWebhookEventId] = useState<string | null>(null)
  const [webhookEventStatus, setWebhookEventStatus] = useState<ChannelWebhookEventStatus | ''>('')
  const [webhookEventFamily, setWebhookEventFamily] = useState<ChannelWebhookEventFamily | ''>('')
  const [webhookEventSearch, setWebhookEventSearch] = useState('')
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [viewMode, setViewMode] = useState<ChannelsView>('channels')
  const [channelCreateOpen, setChannelCreateOpen] = useState(false)

  const clearCredentialForm = () => {
    setCredentialsChannelId('')
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
    Promise.all([api.channels.list(businessLineId), api.businessLines.list()]).then(async ([channelResult, lineResult]) => {
      if (!active) return
      setChannels(channelResult)
      const activeLines = lineResult.data.filter((line) => line.status === 'active')
      setBusinessLines(activeLines)
      const profileResults = await Promise.allSettled(activeLines.map(async (line) => [line.id, await api.agents.listAssistantProfiles(line.id)] as const))
      if (!active) return
      setAssistantProfiles(Object.fromEntries(profileResults.flatMap((result) => result.status === 'fulfilled' ? [result.value] : [])))
      setForm((current) => businessLineId && activeLines.some((line) => line.id === businessLineId)
        ? { ...current, businessLineId }
        : current.businessLineId && activeLines.some((line) => line.id === current.businessLineId)
        ? current
        : { ...current, businessLineId: activeLines.find((line) => line.isDefault)?.id ?? activeLines[0]?.id ?? '' })
    }).catch(() => { if (active) setError(t('channels.loadFailed')) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [businessLineId, refresh, t])

  const monitoringChannels = useMemo(() => channels.filter((channel) => channel.provider === 'evolution'), [channels])
  const eligibleMonitoringChannels = useMemo(() => monitoringChannels.filter((channel) => channel.isActive && channel.isConfigured), [monitoringChannels])
  const refreshMonitoring = useCallback(async () => {
    if (monitoringCheckInFlight.current || eligibleMonitoringChannels.length === 0) return
    monitoringCheckInFlight.current = true
    setMonitoringChecking(true)
    const channelIds = eligibleMonitoringChannels.map((channel) => channel.id)
    try {
      for (let offset = 0; offset < channelIds.length; offset += MONITORING_CHECK_BATCH_SIZE) {
        const batch = channelIds.slice(offset, offset + MONITORING_CHECK_BATCH_SIZE)
        try {
          const result = await api.channels.monitoringCheck(batch)
          setMonitoringChecks((current) => ({ ...current, ...Object.fromEntries(result.data.map((item) => [item.channelId, item])) }))
          setMonitoringCheckErrors((current) => {
            const next = { ...current }
            for (const channelId of batch) delete next[channelId]
            return next
          })
        } catch {
          setMonitoringCheckErrors((current) => ({ ...current, ...Object.fromEntries(batch.map((channelId) => [channelId, true])) }))
        }
      }
    } finally {
      monitoringCheckInFlight.current = false
      setMonitoringChecking(false)
    }
  }, [eligibleMonitoringChannels])

  useEffect(() => {
    if (viewMode !== 'monitoring') return
    void refreshMonitoring()
    const timer = window.setInterval(() => void refreshMonitoring(), MONITORING_CHECK_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [viewMode, refreshMonitoring])

  useEffect(() => {
    if (!eventsChannel) return
    let active = true
    setWebhookEventsLoading(true); setWebhookEventsError(false)
    const debounce = window.setTimeout(() => api.channels.webhookEvents(eventsChannel.id, webhookEventsLimit, webhookEventsOffset, {
      ...(webhookEventStatus ? { status: webhookEventStatus } : {}),
      ...(webhookEventFamily ? { eventFamily: webhookEventFamily } : {}),
      ...(webhookEventSearch.trim() ? { search: webhookEventSearch.trim() } : {}),
    })
      .then((result) => { if (active) setWebhookEvents(result) })
      .catch(() => { if (active) setWebhookEventsError(true) })
      .finally(() => { if (active) setWebhookEventsLoading(false) }), 250)
    return () => { active = false; window.clearTimeout(debounce) }
  }, [eventsChannel, webhookEventsLimit, webhookEventsOffset, webhookEventStatus, webhookEventFamily, webhookEventSearch, webhookEventsRefresh])

  useEffect(() => {
    if (!eventsChannel) return
    let active = true
    setMediaHealthLoading(true)
    setMediaHealthError(false)
    void api.channels.mediaHealth(eventsChannel.id).then((result) => { if (active) setMediaHealth(result) }).catch(() => { if (active) setMediaHealthError(true) }).finally(() => { if (active) setMediaHealthLoading(false) })
    const timer = window.setInterval(() => setMediaHealthRefresh((value) => value + 1), 60_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [eventsChannel, mediaHealthRefresh])

  const rows = useMemo(() => {
    const search = query.trim().toLocaleLowerCase()
    const filtered = channels.filter((channel) => `${channel.displayName} ${channel.businessLineName ?? ''} ${channel.phoneNumber} ${channel.provider} ${channel.providerChannelId} ${channel.providerAccountId ?? ''}`.toLocaleLowerCase().includes(search))
    const direction = sortDirection === 'asc' ? 1 : -1
    return filtered.sort((left, right) => {
      const values: Record<SortKey, [string, string]> = {
        displayName: [left.displayName, right.displayName], businessLine: [left.businessLineName ?? '', right.businessLineName ?? ''], provider: [left.provider, right.provider], phoneNumber: [left.phoneNumber, right.phoneNumber], status: [`${left.isActive ? '0' : '1'}-${left.isConfigured ? '0' : '1'}-${healthChecks[left.id]?.status ?? 'z'}`, `${right.isActive ? '0' : '1'}-${right.isConfigured ? '0' : '1'}-${healthChecks[right.id]?.status ?? 'z'}`], dailyMessageCount: [String(left.dailyMessageCount).padStart(8, '0'), String(right.dailyMessageCount).padStart(8, '0')],
      }
      return values[sortKey][0].localeCompare(values[sortKey][1]) * direction || left.id.localeCompare(right.id)
    })
  }, [channels, healthChecks, query, sortKey, sortDirection])

  const createChannel = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      const created = await api.channels.create({ ...form, providerChannelId: form.provider === 'evolution' ? `sales-${crypto.randomUUID()}` : form.providerChannelId, providerAccountId: form.provider === 'whatsapp_cloud_api' ? form.providerAccountId : undefined })
      setChannels((current) => [created, ...current.filter((channel) => channel.id !== created.id)])
      setForm({ ...emptyForm, businessLineId: created.businessLineId ?? '' })
      setChannelCreateOpen(false)
      clearCredentialForm()
      setCredentialsChannelId(created.id)
      setQuery(''); setOffset(0); setRefresh((version) => version + 1)
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('channels.created'))
    } catch (caught) { notifySystemAlert(SYSTEM_ALERT_KIND.error, caught instanceof ApiError && caught.code === 'PLATFORM_EVOLUTION_NOT_CONFIGURED' ? t('channels.platformEvolutionMissing') : caught instanceof ApiError && caught.code === 'PLATFORM_EVOLUTION_CONFIGURATION_INVALID' ? t('channels.platformEvolutionInvalid') : t('channels.saveFailed')) }
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
  const updateChannelProfile = async (channel: ChannelDto, direction: 'inbound' | 'outbound', profileId: string) => {
    setUpdatingId(channel.id); setError('')
    try {
      await api.channels.update(channel.id, direction === 'inbound' ? { inboundAssistantProfileId: profileId || null } : { outboundAssistantProfileId: profileId || null })
      setChannels((current) => current.map((item) => item.id !== channel.id ? item : { ...item, [direction === 'inbound' ? 'inboundAssistantProfileId' : 'outboundAssistantProfileId']: profileId || null }))
    } catch { setError(t('channels.profileAssignmentFailed')) }
    finally { setUpdatingId('') }
  }
  const deleteChannel = async () => {
    const channel = channelToDelete
    if (!channel) return
    setChannelToDelete(null)
    setDeletingId(channel.id); setError('')
    try {
      await api.channels.delete(channel.id)
      setChannels((current) => current.filter((item) => item.id !== channel.id))
      if (offset > 0 && rows.length - 1 <= offset) setOffset((current) => Math.max(0, current - limit))
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('channels.deleteSucceeded'))
    }
    catch (error) { notifySystemAlert(SYSTEM_ALERT_KIND.error, t(error instanceof ApiError && error.code === 'CHANNEL_ALREADY_PAIRED' ? 'channels.deletePairedBlocked' : 'channels.deleteFailed')) }
    finally { setDeletingId('') }
  }
  const saveQuota = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!quotaChannel || quotaLimit === null) return
    setSavingQuota(true); setError('')
    try { await api.channels.update(quotaChannel.id, { dailyMessageLimit: quotaLimit }); setQuotaChannel(null); setRefresh((version) => version + 1) }
    catch { setError(t('channels.quotaUpdateFailed')) }
    finally { setSavingQuota(false) }
  }
  const openPolicy = (channel: ChannelDto) => {
    setPolicyChannel(channel); setPolicyMode(channel.operationMode); setAssistantScheduleMode(channel.assistantScheduleMode); setPolicyTimeZone(channel.dailyLimitTimeZone)
    setPolicyAllDay(channel.businessHours.length === 0)
    setPolicyHours(WEEKDAYS.map((dayOfWeek) => { const saved = channel.businessHours.find((window) => window.dayOfWeek === dayOfWeek); return { dayOfWeek, enabled: Boolean(saved), startTime: saved?.startTime ?? '09:00', endTime: saved?.endTime ?? '18:00' } }))
  }
  const openScheduleExceptions = (channel: ChannelDto) => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: channel.dailyLimitTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
    const year = parts.find(({ type }) => type === 'year')?.value
    const month = parts.find(({ type }) => type === 'month')?.value
    const day = parts.find(({ type }) => type === 'day')?.value
    setScheduleExceptionChannel(channel)
    const today = year && month && day ? `${year}-${month}-${day}` : ''
    setExceptionFromDate(today); setExceptionToDate(today)
    setExceptionDays(defaultExceptionDays()); setExceptionError(false)
  }
  const saveScheduleException = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!scheduleExceptionChannel || !exceptionFromDate || !exceptionToDate) return
    setSavingException(true); setExceptionError(false)
    try {
      const weekdaySchedules = exceptionDays.filter((day) => day.selected).map((day) => ({ dayOfWeek: day.dayOfWeek, assistantEnabled: day.assistantEnabled, startTime: day.assistantEnabled && !day.allDay ? day.startTime : null, endTime: day.assistantEnabled && !day.allDay ? day.endTime : null, endDayOffset: day.assistantEnabled && !day.allDay ? (day.endDayOfWeek - day.dayOfWeek + 7) % 7 : 0 }))
      if (weekdaySchedules.length === 0) { setExceptionError(true); return }
      const saved = await api.channels.saveScheduleException(scheduleExceptionChannel.id, { fromDate: exceptionFromDate, toDate: exceptionToDate, weekdaySchedules })
      setScheduleExceptionChannel((channel) => channel ? { ...channel, scheduleExceptions: [...channel.scheduleExceptions.filter((item) => item.localDate < exceptionFromDate || item.localDate > exceptionToDate), ...saved].sort((left, right) => left.localDate.localeCompare(right.localDate)) } : channel)
      setRefresh((version) => version + 1)
    } catch { setExceptionError(true) }
    finally { setSavingException(false) }
  }
  const deleteScheduleException = async (exceptionId: string) => {
    if (!scheduleExceptionChannel) return
    setSavingException(true); setExceptionError(false)
    try {
      await api.channels.deleteScheduleException(scheduleExceptionChannel.id, exceptionId)
      setScheduleExceptionChannel((channel) => channel ? { ...channel, scheduleExceptions: channel.scheduleExceptions.filter((item) => item.id !== exceptionId) } : channel)
      setRefresh((version) => version + 1)
    } catch { setExceptionError(true) }
    finally { setSavingException(false) }
  }
  const savePolicy = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!policyChannel) return
    setSavingPolicy(true); setError('')
    try {
      const businessHours = policyAllDay ? [] : policyHours.filter((window) => window.enabled).map(({ dayOfWeek, startTime, endTime }) => ({ dayOfWeek, startTime, endTime }))
      if (!policyAllDay && businessHours.length === 0) { setError(t('channels.businessHoursRequired')); return }
      await api.channels.update(policyChannel.id, { operationMode: policyMode, assistantScheduleMode, dailyLimitTimeZone: policyTimeZone, businessHours })
      setPolicyChannel(null); setRefresh((version) => version + 1)
    } catch { setError(t('channels.policySaveFailed')) }
    finally { setSavingPolicy(false) }
  }
  const policyModeHint = policyMode === 'outbound' ? 'channels.policyOutboundHint' : policyMode === 'hybrid' ? 'channels.policyHybridHint' : 'channels.policyInboundHint'
  const assistantScheduleHint = `channels.assistantScheduleHints.${assistantScheduleMode}`
  const discoverInstances = async (channel: ChannelDto) => {
    setDiscoveryChannel(channel); setDiscovery(null); setDiscoveryError(false); setDiscoveryLoading(true)
    try { setDiscovery(await api.channels.discoverEvolutionInstances(channel.id)) }
    catch { setDiscoveryError(true) }
    finally { setDiscoveryLoading(false) }
  }
  const prefillDiscoveredInstance = (instance: NonNullable<EvolutionInstanceListDto['instances'][number]>) => {
    if (!instance.phoneNumber) return
    const phoneNumber = instance.phoneNumber
    setForm((current) => ({ ...current, provider: 'evolution', displayName: instance.displayName, phoneNumber, providerChannelId: instance.instanceName, providerAccountId: '' }))
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
        ? { provider: 'evolution' }
        : { provider: 'whatsapp_cloud_api', accessToken: cloudAccessToken, signalSecret: cloudSignalSecret })
      setHealthChecks((current) => { const next = { ...current }; delete next[channel.id]; return next })
      setHealthCheckErrors((current) => { const next = { ...current }; delete next[channel.id]; return next })
      clearCredentialForm(); setRefresh((version) => version + 1)
      if (channel.provider === 'evolution') void requestEvolutionConnection(channel)
    } catch (caught) { notifySystemAlert(SYSTEM_ALERT_KIND.error, caught instanceof ApiError && caught.code === 'PLATFORM_EVOLUTION_NOT_CONFIGURED' ? t('channels.platformEvolutionMissing') : caught instanceof ApiError && caught.code === 'PLATFORM_EVOLUTION_CONFIGURATION_INVALID' ? t('channels.platformEvolutionInvalid') : t('channels.credentialsFailed')) }
    finally { setSavingCredentials(false) }
  }

  const checkConnection = async (channelId: string) => {
    setCheckingChannelIds((current) => [...current, channelId])
    setHealthChecks((current) => { const next = { ...current }; delete next[channelId]; return next })
    setHealthCheckErrors((current) => ({ ...current, [channelId]: false }))
    try {
      const result = await api.channels.healthCheck(channelId)
      setHealthChecks((current) => ({ ...current, [channelId]: result }))
      setRefresh((version) => version + 1)
    } catch {
      setHealthCheckErrors((current) => ({ ...current, [channelId]: true }))
    } finally {
      setCheckingChannelIds((current) => current.filter((id) => id !== channelId))
    }
  }

  const closePairingModal = useCallback(() => {
    pairingRequestId.current += 1
    setConnectionChannel(null)
    setConnectionResult(null)
    setConnectionError(false)
    setConnectionLoading(false)
  }, [])

  const configureEvolutionWebhook = async (channelId: string) => {
    setConfiguringWebhookIds((current) => [...current, channelId])
    try {
      await api.channels.configureEvolutionWebhook(channelId)
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('channels.webhookConfigured'))
    } catch {
      notifySystemAlert(SYSTEM_ALERT_KIND.error, t('channels.webhookConfigurationFailed'))
    } finally {
      setConfiguringWebhookIds((current) => current.filter((id) => id !== channelId))
    }
  }

  const retryWebhookEvent = async (eventId: string) => {
    if (!eventsChannel || retryingWebhookEventId) return
    setRetryingWebhookEventId(eventId)
    try {
      await api.channels.retryWebhookEvent(eventsChannel.id, eventId)
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('channels.eventRetryQueued'))
      setWebhookEventsRefresh((version) => version + 1)
    } catch {
      notifySystemAlert(SYSTEM_ALERT_KIND.error, t('channels.eventRetryFailed'))
    } finally {
      setRetryingWebhookEventId(null)
    }
  }

  const requestEvolutionConnection = async (channel: ChannelDto) => {
    const requestId = pairingRequestId.current + 1
    pairingRequestId.current = requestId
    setConnectionChannel(channel); setConnectionResult(null); setConnectionError(false); setConnectionLoading(true)
    try {
      const result = await api.channels.connectEvolution(channel.id)
      if (pairingRequestId.current === requestId) {
        setConnectionResult(result)
        setRefresh((version) => version + 1)
        if (result.status === CHANNEL_CONNECTION_STATUS.connected) {
          notifySystemAlert(result.webhookConfigured ? SYSTEM_ALERT_KIND.success : SYSTEM_ALERT_KIND.error, t(result.webhookConfigured ? 'channels.connection.connected' : 'channels.pairingWebhookFailed'))
          closePairingModal()
        }
      }
    } catch {
      if (pairingRequestId.current === requestId) setConnectionError(true)
    } finally {
      if (pairingRequestId.current === requestId) setConnectionLoading(false)
    }
  }

  useEffect(() => {
    const channel = connectionChannel
    const result = connectionResult
    if (!channel || !result?.qrDataUrl || result.status === CHANNEL_CONNECTION_STATUS.connected) return

    let active = true
    let checkInFlight = false
    const checkPairingStatus = async () => {
      if (checkInFlight) return
      checkInFlight = true
      try {
        const monitoring = await api.channels.monitoringCheck([channel.id])
        const liveStatus = monitoring.data.find((item) => item.channelId === channel.id)
        if (!active || liveStatus?.status !== CHANNEL_CONNECTION_STATUS.connected) return

        const persistedHealth = await api.channels.healthCheck(channel.id).catch(() => null)
        if (!active) return
        const checkedAt = persistedHealth?.status === CHANNEL_CONNECTION_STATUS.connected ? persistedHealth.checkedAt : liveStatus.checkedAt
        const connectedHealth: ChannelHealthCheckDto = { status: CHANNEL_CONNECTION_STATUS.connected, checkedAt }
        setHealthChecks((current) => ({ ...current, [channel.id]: connectedHealth }))
        setHealthCheckErrors((current) => ({ ...current, [channel.id]: false }))
        setChannels((current) => current.map((item) => item.id === channel.id
          ? { ...item, connectionStatus: CHANNEL_CONNECTION_STATUS.connected, connectionUpdatedAt: checkedAt, hasEverConnected: true }
          : item))
        if (persistedHealth?.status === CHANNEL_CONNECTION_STATUS.connected) setRefresh((version) => version + 1)
        notifySystemAlert(result.webhookConfigured ? SYSTEM_ALERT_KIND.success : SYSTEM_ALERT_KIND.error, t(result.webhookConfigured ? 'channels.connection.connected' : 'channels.pairingWebhookFailed'))
        closePairingModal()
      } catch {
        // Keep the QR open and retry while Evolution is temporarily unavailable.
      } finally {
        checkInFlight = false
      }
    }

    void checkPairingStatus()
    const timer = window.setInterval(() => void checkPairingStatus(), PAIRING_STATUS_POLL_INTERVAL_MS)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [closePairingModal, connectionChannel, connectionResult, t])

  const monitoringCounts = monitoringChannels.reduce((counts, channel) => {
    const status = toMonitoringConnectionStatus(monitoringChecks[channel.id]?.status, channel.connectionStatus)
    counts[status] += 1
    return counts
  }, { connected: 0, connecting: 0, disconnected: 0, unknown: 0 })

  const renderAssistantProfileAssignments = (channel: ChannelDto) => {
    const profiles = channel.businessLineId ? assistantProfiles[channel.businessLineId] ?? [] : []
    if (!channel.businessLineId || (profiles.length === 0 && !channel.inboundAssistantProfileId && !channel.outboundAssistantProfileId)) return null
    const renderSelect = (direction: 'inbound' | 'outbound', assignedId: string | null) => {
      const options = profiles.filter((profile) => profile.direction === direction)
      return <label key={direction}>{t(`channels.${direction}Profile`)}<SelectField value={assignedId ?? ''} disabled={updatingId === channel.id} onChange={(event) => void updateChannelProfile(channel, direction, event.target.value)}><option value="">{t('channels.useLineProfile')}</option>{options.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.enabled ? '' : ` · ${t('channels.profileDisabled')}`}</option>)}</SelectField></label>
    }
    return <details className="channel-profile-assignment"><summary>{t('channels.assistantProfiles')}</summary>{channel.operationMode !== 'outbound' && renderSelect('inbound', channel.inboundAssistantProfileId)}{channel.operationMode !== 'inbound' && renderSelect('outbound', channel.outboundAssistantProfileId)}</details>
  }

  const columns: DataTableColumn<ChannelDto, SortKey>[] = [
    { id: 'displayName', label: t('channels.columns.name'), render: (channel) => <div className="channel-name-cell"><WhatsAppMark size={19} /><strong>{channel.displayName}</strong></div> },
    { id: 'businessLine', label: t('businessLines.title'), render: (channel) => channel.businessLineName ?? '' },
    { id: 'provider', label: t('channels.columns.provider'), render: (channel) => <span className="channel-provider-cell"><WhatsAppMark size={16} />{t(`channels.providers.${channel.provider}`)}</span> },
    { id: 'phoneNumber', label: t('channels.columns.number'), render: (channel) => channel.phoneNumber },
    { id: 'dailyMessageCount', label: t('channels.columns.dailyQuota'), render: (channel) => <div className="channel-quota-cell"><strong>{t('channels.quotaUsage', { used: channel.dailyMessageCount, limit: channel.dailyMessageLimit })}</strong><small>{channel.dailyLimitTimeZone}</small><IconButton label={t('channels.editQuota', { name: channel.displayName })} onClick={() => { setQuotaChannel(channel); setQuotaLimit(channel.dailyMessageLimit) }}><Settings2 size={16} /></IconButton></div> },
    { id: 'status', label: t('channels.columns.routing'), render: (channel) => {
      const health = healthChecks[channel.id]
      const checkedAt = health ? new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(health.checkedAt)) : ''
      const checking = checkingChannelIds.includes(channel.id)
      const configuringWebhook = configuringWebhookIds.includes(channel.id)
      const connectionDate = channel.connectionUpdatedAt ? new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(channel.connectionUpdatedAt)) : ''
      const policyWindow = channel.businessHours.length === 0 ? t('channels.policy24Hours') : t('channels.policyDaysConfigured', { count: channel.businessHours.length })
      const hasAssistantHours = channel.assistantScheduleMode === 'business_hours' || channel.assistantScheduleMode === 'after_hours'
      return <div className="channel-status-cell"><span className={`channel-status ${channel.isActive ? 'active' : ''}`}>{t(channel.isActive ? 'channels.active' : 'channels.disabled')}</span><span className={`channel-status ${channel.isConfigured ? 'active' : ''}`}>{t(channel.isConfigured ? 'channels.configured' : 'channels.notConfigured')}</span><div className="channel-policy-summary"><strong>{t(`channels.operationModes.${channel.operationMode}`)}</strong>{channel.operationMode !== 'outbound' && <span>{t(`channels.assistantScheduleModes.${channel.assistantScheduleMode}`)}</span>}{(channel.operationMode !== 'inbound' || hasAssistantHours) && <span>{policyWindow}</span>}</div>{renderAssistantProfileAssignments(channel)}<IconButton label={t('channels.policyConfigure', { name: channel.displayName })} onClick={() => openPolicy(channel)}><Settings2 size={16} /></IconButton>{channel.operationMode !== 'outbound' && <IconButton label={t('channels.scheduleExceptionsManage', { name: channel.displayName, count: channel.scheduleExceptions.length })} onClick={() => openScheduleExceptions(channel)}><CalendarClock size={16} /></IconButton>}{channel.provider === 'evolution' && channel.connectionStatus && <small className={`channel-health-result ${channel.connectionStatus === CHANNEL_CONNECTION_STATUS.connected ? '' : 'error'}`} role="status">{t(`channels.connection.${channel.connectionStatus}`)}{connectionDate ? ` · ${t('channels.connectionUpdatedAt', { date: connectionDate })}` : ''}</small>}<IconButton label={t('channels.viewEvents', { name: channel.displayName })} onClick={() => { setWebhookEvents(null); setMediaHealth(null); setMediaHealthError(false); setWebhookEventsOffset(0); setEventsChannel(channel) }}><Activity size={16} /></IconButton>{channel.provider === 'evolution' && channel.isConfigured && <><IconButton label={t('channels.discoverInstances', { name: channel.displayName })} onClick={() => void discoverInstances(channel)}><Search size={16} /></IconButton><IconButton label={t('channels.configurePairing', { name: channel.displayName })} disabled={!channel.isActive} onClick={() => void requestEvolutionConnection(channel)}><QrCode size={16} /></IconButton><IconButton label={configuringWebhook ? t('channels.configuringWebhook') : t('channels.configureWebhook')} disabled={!channel.isActive || configuringWebhook} onClick={() => void configureEvolutionWebhook(channel.id)}><Link2 size={16} /></IconButton></>}<IconButton label={t('channels.configureCredentials')} onClick={() => openCredentialForm(channel.id)}><Settings2 size={16} /></IconButton><IconButton label={updatingId === channel.id ? t('common.saving') : channel.isActive ? t('channels.disable') : t('channels.enable')} disabled={updatingId === channel.id} onClick={() => void toggleChannel(channel)}><Power size={16} /></IconButton><IconButton label={checking ? t('channels.checkingConnection') : t('channels.checkProvider')} disabled={checking} onClick={() => void checkConnection(channel.id)}><RefreshCw size={16} /></IconButton>{channel.provider === 'evolution' && <IconButton label={deletingId === channel.id ? t('channels.deleting') : t('channels.delete')} disabled={deletingId === channel.id || updatingId === channel.id} onClick={() => setChannelToDelete(channel)}><Trash2 size={16} /></IconButton>}{health && <small className="channel-health-result" role="status">{t(`channels.health.${health.status}`)} · {t('channels.healthCheckedAt', { date: checkedAt })}</small>}{healthCheckErrors[channel.id] && <small className="channel-health-result error" role="status">{t('channels.healthCheckFailed')}</small>}</div>
    } },
  ]
  return <section className="channels-page">
    <header className="channels-heading"><div><p className="eyebrow">{t('channels.eyebrow')}</p><h2>{t('channels.title')}</h2><p className="muted">{t('channels.description')}</p></div><div className="channel-header-actions">{viewMode === 'channels' && !credentialsChannelId && <Button className="primary" type="button" onClick={() => setChannelCreateOpen(true)}><Plus size={16} />{t('channels.add')}</Button>}<Button className="refresh" type="button" onClick={() => setRefresh((version) => version + 1)} aria-label={t('channels.refresh')}><RefreshCw size={16} /></Button></div></header>
    <div className="channels-view-tabs" role="tablist" aria-label={t('channels.title')}>
      <Button type="button" role="tab" aria-selected={viewMode === 'channels'} onClick={() => setViewMode('channels')}>{t('channels.channelsTab')}</Button>
      <Button type="button" role="tab" aria-selected={viewMode === 'monitoring'} onClick={() => setViewMode('monitoring')}>{t('channels.monitoringTab')}</Button>
    </div>
    {viewMode === 'channels' && <aside className="channel-ownership-note"><ShieldCheck size={19} aria-hidden="true" /><div><strong>{t('channels.responsibilityTitle')}</strong><p>{t('channels.responsibilityHint')}</p></div></aside>}
    {viewMode === 'monitoring' && <section className="channels-monitoring" aria-label={t('channels.monitoringTab')}>
      <header><div><h3>{t('channels.monitoringTab')}</h3><p>{t('channels.monitoringDescription')}</p></div><Button type="button" disabled={loading || monitoringChecking || eligibleMonitoringChannels.length === 0} onClick={() => void refreshMonitoring()}><RefreshCw size={15} />{monitoringChecking ? t('channels.monitoringChecking') : t('channels.monitoringRefreshAll')}</Button></header>
      <div className="channels-monitoring-counts">{(['connected', 'connecting', 'disconnected', 'unknown'] as const).map((status) => <article key={status} className={`is-${status}`}><small>{t(`channels.monitoringCounts.${status}`)}</small><strong>{monitoringCounts[status]}</strong></article>)}</div>
      {loading && <WorkspaceState kind="loading" compact message={t('common.loading')} />}
      {!loading && error && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
      {!loading && monitoringChannels.length === 0 && <WorkspaceState kind="empty" compact message={t('channels.monitoringEmpty')} />}
      <div className="channels-monitoring-list">{monitoringChannels.map((channel) => {
        const liveCheck = monitoringChecks[channel.id]
        const healthStatus = liveCheck?.status
        const status = toMonitoringConnectionStatus(healthStatus, channel.connectionStatus)
        const signalDate = channel.connectionUpdatedAt ? new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(channel.connectionUpdatedAt)) : null
        const checkDate = liveCheck ? new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(liveCheck.checkedAt)) : null
        const stale = channel.connectionUpdatedAt !== null && Date.now() - new Date(channel.connectionUpdatedAt).getTime() > MONITORING_SIGNAL_STALE_MS
        const healthNeedsAttention = healthStatus !== undefined && !['connected', 'connecting', 'disconnected', 'unknown'].includes(healthStatus)
        const channelCheckFailed = channel.isActive && channel.isConfigured && monitoringCheckErrors[channel.id]
        return <article key={channel.id} className={`channels-monitoring-card is-${status}`}>
          <div className="channels-monitoring-identity"><WhatsAppMark size={20} /><div><strong>{channel.displayName}</strong><span>{channel.phoneNumber} · {channel.providerChannelId}</span></div></div>
          <span className={`channel-status ${status === CHANNEL_CONNECTION_STATUS.connected ? 'active' : 'error'}`}>{t(`channels.connection.${status}`)}</span>
          <div className="channels-monitoring-details">
            <small className={stale ? 'is-stale' : ''}>{signalDate ? t(stale ? 'channels.monitoringStale' : 'channels.monitoringLastSignal', { date: signalDate }) : t('channels.monitoringNeverSeen')}</small>
            {checkDate && <small>{t('channels.monitoringCheckedAt', { date: checkDate })}</small>}
            {healthNeedsAttention && <small className="is-stale" role="alert">{t(`channels.health.${healthStatus}`)}</small>}
            {channelCheckFailed && <small className="is-stale" role="alert">{t('channels.monitoringCheckFailed')}</small>}
            {liveCheck && <small className={liveCheck.webhookConfigurationStatus === EVOLUTION_WEBHOOK_CONFIGURATION_STATUS.confirmed ? '' : 'is-stale'} role={liveCheck.webhookConfigurationStatus === EVOLUTION_WEBHOOK_CONFIGURATION_STATUS.drifted ? 'alert' : undefined}>{t(`channels.monitoringWebhook.${liveCheck.webhookConfigurationStatus}`)}</small>}
            {liveCheck && liveCheck.failedDeliveries > 0 && <small className="is-stale" role="alert">{t('channels.monitoringDeliveryFailures', { count: liveCheck.failedDeliveries })}</small>}
          </div>
          <Button type="button" disabled={monitoringChecking || !channel.isActive || !channel.isConfigured} onClick={() => void refreshMonitoring()}><RefreshCw size={14} />{monitoringChecking ? t('channels.monitoringChecking') : t('channels.checkProvider')}</Button>
        </article>
      })}</div>
    </section>}
    <Modal open={quotaChannel !== null} onOpenChange={(open) => { if (!open) { setQuotaChannel(null); setQuotaLimit(null) } }} title={t('channels.quotaTitle', { name: quotaChannel?.displayName ?? '' })} description={t('channels.quotaDescription', { timeZone: quotaChannel?.dailyLimitTimeZone ?? '' })} closeLabel={t('common.close')} className="channel-quota-modal">
      <form className="channel-quota-form" onSubmit={(event) => void saveQuota(event)}>
        <p>{t('channels.quotaCurrentUsage', { used: quotaChannel?.dailyMessageCount ?? 0, limit: quotaChannel?.dailyMessageLimit ?? 0 })}</p>
        <label>{t('channels.quotaLimit')}<NumericField mode="integer" min={1} max={5000} value={quotaLimit} onValueChange={setQuotaLimit} required /></label>
        <Button type="submit" variant="primary" disabled={savingQuota || quotaLimit === null}>{savingQuota ? t('common.saving') : t('channels.saveQuota')}</Button>
      </form>
    </Modal>
    <Modal open={scheduleExceptionChannel !== null} onOpenChange={(open) => { if (!open) setScheduleExceptionChannel(null) }} title={t('channels.scheduleExceptionsTitle', { name: scheduleExceptionChannel?.displayName ?? '' })} description={t('channels.scheduleExceptionsDescription', { timeZone: scheduleExceptionChannel?.dailyLimitTimeZone ?? '' })} closeLabel={t('common.close')} className="channel-schedule-exception-modal">
      {scheduleExceptionChannel?.scheduleExceptions.length ? <ul className="channel-schedule-exception-list">{scheduleExceptionChannel.scheduleExceptions.map((exception) => <li key={exception.id}><div><strong>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${exception.localDate}T12:00:00Z`))}</strong><small>{exception.assistantEnabled ? exception.startTime && exception.endTime ? `${t('channels.scheduleExceptionHours', { start: exception.startTime, end: exception.endTime })}${exception.endDayOffset ? ` · ${t('channels.scheduleExceptionEndsOn', { date: formatExceptionEndDay(exception.localDate, exception.endDayOffset, i18n.language) })}` : ''}` : t('channels.scheduleExceptionAllDay') : t('channels.scheduleExceptionDisabled')}</small></div><IconButton label={t('channels.scheduleExceptionRemove', { date: exception.localDate })} disabled={savingException} onClick={() => void deleteScheduleException(exception.id)}><Power size={15} /></IconButton></li>)}</ul> : <p className="channel-policy-hint">{t('channels.scheduleExceptionsEmpty')}</p>}
      <form className="channel-quota-form channel-schedule-exception-form" onSubmit={(event) => void saveScheduleException(event)}>
        <div className="channel-schedule-exception-times"><label>{t('channels.scheduleExceptionFromDate')}<TextField type="date" value={exceptionFromDate} onChange={(event) => { setExceptionFromDate(event.target.value); if (exceptionToDate < event.target.value) setExceptionToDate(event.target.value) }} required /></label><label>{t('channels.scheduleExceptionToDate')}<TextField type="date" min={exceptionFromDate} value={exceptionToDate} onChange={(event) => setExceptionToDate(event.target.value)} required /></label></div>
        <fieldset className="channel-schedule-weekdays"><legend>{t('channels.scheduleExceptionWeekdayInstruction')}</legend>{exceptionDays.map((day) => <div className={`channel-schedule-weekday${day.selected ? ' selected' : ''}`} key={day.dayOfWeek}><label><CheckboxField checked={day.selected} onChange={(event) => setExceptionDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, selected: event.target.checked } : item))} />{t(`channels.weekdays.${day.dayOfWeek}`)}</label>{day.selected && <><label><CheckboxField checked={day.assistantEnabled} onChange={(event) => setExceptionDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, assistantEnabled: event.target.checked } : item))} />{t('channels.scheduleExceptionEnableAssistant')}</label>{day.assistantEnabled && <><label><CheckboxField checked={day.allDay} onChange={(event) => setExceptionDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, allDay: event.target.checked } : item))} />{t('channels.scheduleExceptionAllDayToggle')}</label>{!day.allDay && <div className="channel-schedule-weekday-times"><label>{t('channels.scheduleExceptionStart')}<TextField type="time" value={day.startTime} onBlur={() => setExceptionDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, rangeTouched: true } : item))} onChange={(event) => setExceptionDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, startTime: event.target.value } : item))} required /></label><label>{t('channels.scheduleExceptionEndDay')}<SelectField value={String(day.endDayOfWeek)} onChange={(event) => setExceptionDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, endDayOfWeek: Number(event.target.value), rangeTouched: true } : item))}>{WEEKDAYS.map((weekday) => <option key={weekday} value={weekday}>{t(`channels.weekdays.${weekday}`)}</option>)}</SelectField></label><label>{t('channels.scheduleExceptionEnd')}<TextField type="time" value={day.endTime} error={day.rangeTouched && hasInvalidExceptionWindow(day) ? t('channels.scheduleExceptionInvalidWindow') : undefined} onBlur={() => setExceptionDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, rangeTouched: true } : item))} onChange={(event) => setExceptionDays((current) => current.map((item) => item.dayOfWeek === day.dayOfWeek ? { ...item, endTime: event.target.value } : item))} required /></label></div>}</>}</>}</div>)}</fieldset>
        {exceptionError && <p role="alert" className="channel-health-result error">{t('channels.scheduleExceptionSaveFailed')}</p>}
        <Button type="submit" variant="primary" disabled={savingException || !exceptionFromDate || !exceptionToDate || exceptionToDate < exceptionFromDate || !exceptionDays.some((day) => day.selected) || exceptionDays.some(hasInvalidExceptionWindow)}>{savingException ? t('common.saving') : t('channels.scheduleExceptionSave')}</Button>
      </form>
    </Modal>
    <Modal open={policyChannel !== null} onOpenChange={(open) => { if (!open) setPolicyChannel(null) }} title={t('channels.policyTitle', { name: policyChannel?.displayName ?? '' })} description={t('channels.policyDescription')} closeLabel={t('common.close')} className="channel-quota-modal">
      <form className="channel-quota-form channel-policy-form" onSubmit={(event) => void savePolicy(event)}>
        <label>{t('channels.operationMode')}<SelectField value={policyMode} onChange={(event) => { const parsed = parseChannelOperationMode(event.target.value); if (parsed) setPolicyMode(parsed) }}><option value="inbound">{t('channels.operationModes.inbound')}</option><option value="outbound">{t('channels.operationModes.outbound')}</option><option value="hybrid">{t('channels.operationModes.hybrid')}</option></SelectField></label>
        <p className="channel-policy-hint" aria-live="polite">{t(policyModeHint)}</p>
        {policyMode !== 'outbound' && <><label>{t('channels.assistantScheduleMode')}<SelectField value={assistantScheduleMode} onChange={(event) => { const parsed = parseAssistantScheduleMode(event.target.value); if (parsed) setAssistantScheduleMode(parsed) }}><option value="always">{t('channels.assistantScheduleModes.always')}</option><option value="business_hours">{t('channels.assistantScheduleModes.business_hours')}</option><option value="after_hours">{t('channels.assistantScheduleModes.after_hours')}</option><option value="disabled">{t('channels.assistantScheduleModes.disabled')}</option></SelectField></label><p className="channel-policy-hint" aria-live="polite">{t(assistantScheduleHint)}</p></>}
        <label>{t('channels.businessHoursTimeZone')}<TextField value={policyTimeZone} onChange={(event) => setPolicyTimeZone(event.target.value)} maxLength={80} required /></label>
        <label><CheckboxField checked={policyAllDay} onChange={(event) => { const allDay = event.target.checked; setPolicyAllDay(allDay); if (!allDay && policyHours.every((window) => !window.enabled)) setPolicyHours((hours) => hours.map((window) => ({ ...window, enabled: window.dayOfWeek >= 1 && window.dayOfWeek <= 5 }))) }} />{t(policyMode === 'outbound' ? 'channels.outboundAllDay' : 'channels.businessHoursAllDay')}</label>
        {!policyAllDay && <fieldset><legend>{t(policyMode === 'outbound' ? 'channels.outboundWindow' : 'channels.businessHours')}</legend>{policyHours.map((window) => <div className="channel-hours-row" key={window.dayOfWeek}><label><CheckboxField checked={window.enabled} onChange={(event) => setPolicyHours((hours) => hours.map((item) => item.dayOfWeek === window.dayOfWeek ? { ...item, enabled: event.target.checked } : item))} />{t(`channels.weekdays.${window.dayOfWeek}`)}</label><TextField type="time" aria-label={t('channels.businessHoursStart', { day: t(`channels.weekdays.${window.dayOfWeek}`) })} value={window.startTime} disabled={!window.enabled} onChange={(event) => setPolicyHours((hours) => hours.map((item) => item.dayOfWeek === window.dayOfWeek ? { ...item, startTime: event.target.value } : item))} /><TextField type="time" aria-label={t('channels.businessHoursEnd', { day: t(`channels.weekdays.${window.dayOfWeek}`) })} value={window.endTime} disabled={!window.enabled} onChange={(event) => setPolicyHours((hours) => hours.map((item) => item.dayOfWeek === window.dayOfWeek ? { ...item, endTime: event.target.value } : item))} /></div>)}</fieldset>}
        <Button type="submit" variant="primary" disabled={savingPolicy}>{savingPolicy ? t('common.saving') : t('channels.savePolicy')}</Button>
      </form>
    </Modal>
    <Modal open={connectionChannel !== null} onOpenChange={(open) => { if (!open) closePairingModal() }} title={t('channels.pairingTitle', { name: connectionChannel?.displayName ?? '' })} description={t('channels.pairingDescription')} closeLabel={t('common.close')} className="channel-pairing-modal">
      {connectionLoading && <WorkspaceState kind="loading" compact message={t('common.loading')} />}
      {connectionError && <WorkspaceState kind="error" compact message={t('channels.pairingFailed')} />}
      {connectionResult && <div className="channel-pairing-content"><p role="status">{t(`channels.connection.${connectionResult.status}`)}</p>{connectionResult.qrDataUrl ? <img src={connectionResult.qrDataUrl} alt={t('channels.pairingQrAlt')} /> : <WorkspaceState kind="empty" compact message={t(connectionResult.status === CHANNEL_CONNECTION_STATUS.connected ? 'channels.pairingAlreadyConnected' : 'channels.pairingQrUnavailable')} />}{!connectionResult.webhookConfigured && <WorkspaceState kind="error" compact message={t('channels.pairingWebhookFailed')} />}<Button type="button" disabled={connectionLoading || connectionResult.status === CHANNEL_CONNECTION_STATUS.connected} onClick={() => connectionChannel && void requestEvolutionConnection(connectionChannel)}><RefreshCw size={15} />{t('channels.refreshPairingQr')}</Button></div>}
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
    <Modal open={eventsChannel !== null} onOpenChange={(open) => { if (!open) { setEventsChannel(null); setWebhookEvents(null); setMediaHealth(null); setWebhookEventsOffset(0); setWebhookEventsLimit(25); setWebhookEventStatus(''); setWebhookEventFamily(''); setWebhookEventSearch('') } }} title={t('channels.eventsTitle', { name: eventsChannel?.displayName ?? '' })} description={t('channels.eventsDescription')} closeLabel={t('common.close')} className="channel-events-modal">
      <section className="channel-media-health" aria-live="polite"><div className="channel-media-health-heading"><div><h3>{t('channels.mediaHealthTitle')}</h3><p>{t('channels.mediaHealthDescription', { minutes: mediaHealth?.staleAfterMinutes ?? 15 })}</p></div><Button type="button" disabled={mediaHealthLoading} onClick={() => setMediaHealthRefresh((value) => value + 1)}><RefreshCw size={14} aria-hidden="true" />{t('channels.mediaHealthRefresh')}</Button></div>{mediaHealthLoading && !mediaHealth && <span className="channel-media-health-state">{t('channels.mediaHealthLoading')}</span>}{mediaHealthError && <span className="channel-media-health-state is-error" role="alert">{t('channels.mediaHealthFailed')}</span>}{mediaHealth?.data.length ? <ul>{mediaHealth.data.map((item) => <li className={item.status === 'failed' ? 'is-failed' : 'is-stale'} key={`${item.mediaType}:${item.status}:${item.stage}:${item.errorCode}`}><div className="channel-media-health-kind"><strong>{t(`inbox.mediaTypes.${item.mediaType}`, { defaultValue: item.mediaType })}</strong><span>{t(`inbox.attachmentStatus.${item.status}`, { defaultValue: item.status })}</span></div><span className="channel-media-health-count">{t('channels.mediaHealthCount', { count: item.count })}</span><div className="channel-media-health-details"><small>{t('channels.mediaHealthOldest', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.oldestUpdatedAt)) })}</small>{item.errorCode && <small>{item.stage ? t(`channels.mediaStage.${item.stage}`, { defaultValue: item.stage }) : t('channels.mediaHealthUnknownStage')} · <code>{item.errorCode}</code></small>}</div></li>)}</ul> : !mediaHealthLoading && !mediaHealthError && mediaHealth && <span className="channel-media-health-state is-clear">{t('channels.mediaHealthClear')}</span>}</section>
      <div className="channel-events-filters">
        <TextField value={webhookEventSearch} onChange={(event) => { setWebhookEventSearch(event.target.value); setWebhookEventsOffset(0) }} maxLength={120} placeholder={t('channels.eventsSearch')} aria-label={t('channels.eventsSearch')} />
        <SelectField value={webhookEventStatus} onChange={(event) => { setWebhookEventStatus(Object.values(CHANNEL_WEBHOOK_EVENT_STATUS).find((status) => status === event.target.value) ?? ''); setWebhookEventsOffset(0) }} aria-label={t('channels.eventsStatusFilter')}><option value="">{t('channels.eventsAllStatuses')}</option>{Object.values(CHANNEL_WEBHOOK_EVENT_STATUS).map((status) => <option key={status} value={status}>{t(`channels.eventStatus.${status}`)}</option>)}</SelectField>
        <SelectField value={webhookEventFamily} onChange={(event) => { setWebhookEventFamily(CHANNEL_WEBHOOK_EVENT_FAMILIES.find((family) => family === event.target.value) ?? ''); setWebhookEventsOffset(0) }} aria-label={t('channels.eventsFamilyFilter')}><option value="">{t('channels.eventsAllFamilies')}</option>{CHANNEL_WEBHOOK_EVENT_FAMILIES.map((family) => <option key={family} value={family}>{t(`channels.eventFamily.${family}`)}</option>)}</SelectField>
      </div>
      {webhookEventsLoading && <WorkspaceState kind="loading" compact message={t('common.loading')} />}
      {webhookEventsError && <WorkspaceState kind="error" compact message={t('channels.eventsFailed')} />}
      {!webhookEventsLoading && !webhookEventsError && webhookEvents?.data.length === 0 && <WorkspaceState kind="empty" compact message={t('channels.eventsEmpty')} />}
      {webhookEvents?.data.length ? <div className="channel-events-list" aria-busy={webhookEventsLoading}>{webhookEvents.data.map((event) => <article key={event.id}>
        <div className="channel-event-heading"><strong>{event.eventType}</strong><span className={`channel-status ${event.status === CHANNEL_WEBHOOK_EVENT_STATUS.processed ? 'active' : event.status === CHANNEL_WEBHOOK_EVENT_STATUS.failed ? 'error' : ''}`}>{t(`channels.eventStatus.${event.status}`)}</span></div>
        <div className="channel-event-meta"><span>{t(`channels.providers.${event.provider}`)} · {t(`channels.eventFamily.${event.eventFamily}`)}</span><time dateTime={event.receivedAt}>{new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.receivedAt))}</time></div>
        <small>{t('channels.eventAttempts', { count: event.attempts })}{event.processedAt ? ` · ${t('channels.eventProcessedAt', { date: new Intl.DateTimeFormat(i18n.language === 'pt-BR' ? 'pt-BR' : 'en', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(event.processedAt)) })}` : ''}</small>
        {event.lastErrorCode && <code>{event.lastErrorCode}</code>}
        {event.correlationId && <small>{t('channels.eventCorrelationId')}: <code>{event.correlationId}</code></small>}
        {event.provider === CHANNEL_PROVIDER.evolution && event.eventType === CHANNEL_WEBHOOK_EVENT.unmatchedMessageStatus && event.status === CHANNEL_WEBHOOK_EVENT_STATUS.failed && event.lastErrorCode === CHANNEL_WEBHOOK_EVENT_RETRY_ERROR.unmatchedStatus && <IconButton label={t('channels.eventRetry')} disabled={retryingWebhookEventId !== null} onClick={() => void retryWebhookEvent(event.id)}><RotateCcw size={15} aria-hidden="true" /></IconButton>}
      </article>)}</div> : null}
      {webhookEvents && webhookEvents.pagination.total > 0 && <div className="channel-events-pagination"><span>{t('table.range', { from: webhookEvents.pagination.offset + 1, to: webhookEvents.pagination.offset + webhookEvents.data.length, total: webhookEvents.pagination.total })}</span><label>{t('table.rowsPerPage')}<SelectField value={webhookEventsLimit} disabled={webhookEventsLoading} onChange={(event) => { setWebhookEventsLimit(Number(event.target.value)); setWebhookEventsOffset(0) }} aria-label={t('table.rowsPerPage')}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</SelectField></label><div><Button type="button" aria-label={t('table.previous')} disabled={webhookEventsLoading || webhookEventsOffset === 0} onClick={() => setWebhookEventsOffset((value) => Math.max(0, value - webhookEventsLimit))}><ChevronLeft size={16} aria-hidden="true" /></Button><Button type="button" aria-label={t('table.next')} disabled={webhookEventsLoading || !webhookEvents.pagination.hasNextPage} onClick={() => setWebhookEventsOffset((value) => value + webhookEventsLimit)}><ChevronRight size={16} aria-hidden="true" /></Button></div></div>}
    </Modal>
    <Modal open={channelCreateOpen} onOpenChange={setChannelCreateOpen} title={t('channels.addTitle')} description={t('channels.addHint')} closeLabel={t('common.close')} className="channel-create-modal">
    {viewMode === 'channels' && !credentialsChannelId && <form className="channel-form" onSubmit={createChannel}>
      <ol className="channel-setup-progress" aria-label={t('channels.setupSteps')}><li aria-current="step"><span>1</span>{t('channels.setupDetails')}</li><li><span>2</span>{t('channels.setupConnection')}</li></ol>
      <div className="channel-form-grid">
        <label>{t('businessLines.title')}<SelectField value={form.businessLineId} required disabled={businessLines.length === 0} onChange={(event) => setForm((current) => ({ ...current, businessLineId: event.target.value }))}>{businessLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</SelectField></label>
        <label><span className="channel-form-label">{t('channels.name')}<span className="channel-required-mark" aria-hidden="true">*</span></span><TextField value={form.displayName} onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))} minLength={2} maxLength={120} pattern=".*\S.*" required /></label>
        <label><span className="channel-form-label">{t('channels.phone')}<span className="channel-required-mark" aria-hidden="true">*</span></span><PhoneField requireInternational value={form.phoneNumber} onValueChange={(phoneNumber) => setForm((current) => ({ ...current, phoneNumber }))} hint={t('channels.phoneHint')} placeholder="+55 (11) 99999-9999" required /></label>
        {form.provider === 'whatsapp_cloud_api' && <label><span className="channel-form-label">{t('channels.phoneNumberId')}<span className="channel-required-mark" aria-hidden="true">*</span></span><TextField value={form.providerChannelId} onChange={(event) => setForm((current) => ({ ...current, providerChannelId: event.target.value }))} minLength={1} maxLength={200} pattern=".*\\S.*" required /></label>}
        {form.provider === 'whatsapp_cloud_api' && <label><span className="channel-form-label">{t('channels.businessAccount')}<span className="channel-required-mark" aria-hidden="true">*</span></span><TextField value={form.providerAccountId ?? ''} onChange={(event) => setForm((current) => ({ ...current, providerAccountId: event.target.value }))} minLength={1} maxLength={200} pattern=".*\S.*" required /></label>}
      </div>
      <details className="channel-advanced-provider"><summary>{t('channels.advancedProvider')}</summary><p>{t('channels.advancedProviderHint')}</p><label>{t('channels.provider')}<SelectField value={form.provider} onChange={(event) => updateProvider(event.target.value)}><option value="evolution">{t('channels.providers.evolution')}</option><option value="whatsapp_cloud_api">{t('channels.providers.whatsapp_cloud_api')}</option></SelectField></label></details>
      <div className="channel-form-footer"><p>{businessLines.length === 0 ? t('businessLines.empty') : t(form.provider === 'evolution' ? 'channels.connectionResponsibilities' : 'channels.cloudSetupResponsibilities')}</p><Button type="button" onClick={() => setChannelCreateOpen(false)}>{t('common.cancel')}</Button><Button className="primary" disabled={saving || !form.businessLineId}>{saving ? t('common.saving') : <><Check size={15} />{t('channels.continueToConnection')}</>}</Button></div>
    </form>}
    </Modal>
    <Modal open={Boolean(credentialsChannelId)} onOpenChange={(open) => { if (!open) clearCredentialForm() }} title={channels.find((item) => item.id === credentialsChannelId) ? t('channels.configureTitle', { name: channels.find((item) => item.id === credentialsChannelId)?.displayName ?? '' }) : t('channels.configureCredentials')} closeLabel={t('common.close')} className="channel-credentials-modal">
    {viewMode === 'channels' && credentialsChannelId && (() => { const channel = channels.find((item) => item.id === credentialsChannelId); return channel ? <form className="channel-form channel-credentials-form" onSubmit={configureCredentials}>
      <ol className="channel-setup-progress" aria-label={t('channels.setupSteps')}><li className="is-complete"><span><Check size={13} /></span>{t('channels.setupDetails')}</li><li aria-current="step"><span>2</span>{t('channels.setupConnection')}</li></ol>
      <div className="channel-form-grid">
        {channel.provider === 'evolution' ? <div className="channel-managed-connection-note" role="note"><ShieldCheck size={18} aria-hidden="true" /><p>{t('channels.managedConnectionTitle')}</p></div> : <><label>{t('channels.cloudAccessToken')}<TextField value={cloudAccessToken} onChange={(event) => setCloudAccessToken(event.target.value)} type="password" autoComplete="new-password" maxLength={4000} required /></label><label>{t('channels.agentSignalSecret')}<TextField value={cloudSignalSecret} onChange={(event) => setCloudSignalSecret(event.target.value)} type="password" autoComplete="new-password" minLength={32} maxLength={500} required /><small>{t('channels.agentSignalSecretHint')}</small></label><label>{t('inboxComposer.cloudWebhookUrl')}<TextField readOnly value={`${apiBaseUrl}/api/v1/webhooks/whatsapp-cloud`} /></label><label>{t('channels.agentSignalUrl')}<TextField readOnly value={`${apiBaseUrl}/api/v1/webhooks/${channel.id}/agent-signals/interpretation-failure`} /></label></>}
      </div>
      <div className="channel-form-footer"><p>{t('channels.credentialsNeverShown')}</p><Button type="button" onClick={clearCredentialForm}>{t('common.cancel')}</Button><Button className="primary" disabled={savingCredentials}>{savingCredentials ? t('common.saving') : t(channel.provider === 'evolution' ? 'channels.saveAndPair' : 'channels.saveCredentials')}</Button></div>
    </form> : null })()}
    </Modal>
    {viewMode === 'channels' && error && rows.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')}><Button type="button" onClick={() => setRefresh((version) => version + 1)}>{t('platform.retry')}</Button></WorkspaceState>}
    {viewMode === 'channels' && <DataTable rows={rows.slice(offset, offset + limit)} columns={columns} getRowId={(channel) => channel.id} sort={{ key: sortKey, direction: sortDirection }} onSortChange={(key, direction) => { setSortKey(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit, offset, total: rows.length, hasNextPage: offset + limit < rows.length }} onPageChange={setOffset} onPageSizeChange={(size) => { setLimit(size); setOffset(0) }} loading={loading} emptyState={<div><strong>{error || t('channels.empty')}</strong>{error && <Button type="button" onClick={() => setRefresh((version) => version + 1)}>{t('platform.retry')}</Button>}</div>} emptyStateKind={error ? 'error' : 'empty'} filters={<label className="channel-search"><Search size={15} /><TextField value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder={t('channels.search')} aria-label={t('channels.search')} /></label>} />}
    <ConfirmDialog open={channelToDelete !== null} onOpenChange={(open) => { if (!open) setChannelToDelete(null) }} title={t('common.confirmAction')} description={channelToDelete ? t('channels.deleteConfirm', { name: channelToDelete.displayName }) : ''} confirmLabel={t('channels.delete')} cancelLabel={t('common.cancel')} closeLabel={t('common.close')} destructive onConfirm={deleteChannel} />
  </section>
}
