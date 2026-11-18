import { Button, CalendarField, CheckboxField, IconButton, NumericField, PhoneField, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Bot, CalendarDays, Megaphone, Plus, RefreshCw, Search, Star, Trash2, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import { ACCOUNT_SEGMENT_FILTER, api, ApiError, CONTACT_OUTREACH_BASIS, CONTACT_OUTREACH_BASIS_VALUES, CONTACT_OUTREACH_DECISION, CONTACT_OUTREACH_DECISION_VALUES, LEAD_SOURCE_VALUES, SDR_PREVIEW_PAGE_SIZE, parseLeadStatus, type AccountSegmentDto, type CreateLeadContactInput, type CreateLeadInput, type LeadAssigneeDto, type LeadContactDto, type LeadDto, type LeadDuplicateCandidateDto, type LeadSortBy, type LeadStatus, type SdrPreviewChannelDto, type SdrPreviewDto, type SdrReadinessDto } from '../lib/api'
import { ACCOUNT_MARKET_FILTER, ACCOUNT_MARKET_SEGMENTS } from '../lib/accountConstants'
import { CAMPAIGN_AUDIENCE_MAX_LEADS, CAMPAIGN_AUDIENCE_PAGE_SIZE, CAMPAIGN_DRAFT_STATUS, CAMPAIGN_NO_SEND_DATE_MAX, CAMPAIGN_TIME_ZONE_DEFAULT, api as campaignsApi, type CampaignAudiencePreviewDto, type CampaignDraftDto, type CampaignDraftPageDto, type CampaignNoSendDateDto, type CampaignOperationalReadinessDto, type CreateCampaignDraftInput } from '../lib/api'
import i18n from '../lib/i18n'
import './LeadsWorkspace.css'
import './LeadDuplicateReview.css'
import './LeadProfile.css'

const statusOrder: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']
const sourceOrder: NonNullable<CreateLeadInput['source']>[] = [...LEAD_SOURCE_VALUES]
type SortDirection = 'asc' | 'desc'
type OutreachDecision = (typeof CONTACT_OUTREACH_DECISION)[keyof typeof CONTACT_OUTREACH_DECISION]
type OutreachBasis = (typeof CONTACT_OUTREACH_BASIS)[keyof typeof CONTACT_OUTREACH_BASIS]
type OutreachDraft = { decision: OutreachDecision; basis: OutreachBasis | ''; evidence: string }
type CampaignTab = 'campaigns' | 'calendar' | 'delivery-review'

function CampaignAudienceEditor({ draft, onClose, onSaved }: { draft: CampaignDraftDto; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<CampaignAudiencePreviewDto | null>(null)
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set())
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const load = useCallback(async (nextOffset = 0, initialize = false) => {
    setLoading(true); setError('')
    try {
      const result = await campaignsApi.campaigns.previewAudience(draft.id, { limit: CAMPAIGN_AUDIENCE_PAGE_SIZE, offset: nextOffset })
      setPreview(result); setOffset(nextOffset)
      if (initialize) setSelectedLeadIds(new Set(result.selectedLeadIds))
    } catch { setError(t('campaignAudience.loadFailed')) }
    finally { setLoading(false) }
  }, [draft.id, t])
  useEffect(() => { void load(0, true) }, [load])
  const toggleLead = (leadId: string, checked: boolean) => {
    setSelectedLeadIds((current) => {
      const next = new Set(current)
      if (checked) { if (next.size < CAMPAIGN_AUDIENCE_MAX_LEADS) next.add(leadId) }
      else next.delete(leadId)
      return next
    })
    setSaved(false)
  }
  const save = async () => {
    setSaving(true); setError(''); setSaved(false)
    try {
      await campaignsApi.campaigns.saveAudience(draft.id, [...selectedLeadIds])
      setSaved(true); onSaved(); await load(offset, true)
    } catch { await load(offset); setError(t('campaignAudience.saveFailed')) }
    finally { setSaving(false) }
  }
  const pageCount = Math.max(1, Math.ceil((preview?.pagination.total ?? 0) / CAMPAIGN_AUDIENCE_PAGE_SIZE))
  return <Modal open onOpenChange={(open) => { if (!open) onClose() }} title={t('campaignAudience.title', { campaign: draft.name })} description={t('campaignAudience.description')} closeLabel={t('common.close')} className="campaign-audience-modal">
    {error && <WorkspaceState kind="error" compact message={error}><Button type="button" onClick={() => void load(offset)}>{t('sdrPreview.retry')}</Button></WorkspaceState>}
    {saved && <p className="campaign-audience-saved" role="status">{t('campaignAudience.saved')}</p>}
    {preview && <div className="campaign-audience-summary"><strong>{t('campaignAudience.selectionCount', { count: selectedLeadIds.size + preview.restrictedSelectedCount, max: CAMPAIGN_AUDIENCE_MAX_LEADS })}</strong><span>{t('campaignAudience.totalLeads', { count: preview.pagination.total })}</span><span>{t('campaignAudience.eligibleOnPage', { count: preview.pageSummary.eligible })}</span><span>{t('campaignAudience.excludedOnPage', { count: preview.pageSummary.excluded })}</span>{preview.restrictedSelectedCount > 0 && <span>{t('campaignAudience.restrictedSelectedCount', { count: preview.restrictedSelectedCount })}</span>}</div>}
    {loading && !preview ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : preview && <>
      {preview.leads.length === 0 ? <WorkspaceState kind="empty" message={t('campaignAudience.empty')} /> : <ul className="campaign-audience-list">{preview.leads.map((lead) => {
        const checked = selectedLeadIds.has(lead.leadId)
        const unavailableAtLimit = !checked && selectedLeadIds.size + (preview.restrictedSelectedCount ?? 0) >= CAMPAIGN_AUDIENCE_MAX_LEADS
        return <li key={lead.leadId} className={lead.blockers.length ? 'is-excluded' : 'is-eligible'}>
          <label><CheckboxField checked={checked} disabled={saving || (lead.blockers.length > 0 && !checked) || unavailableAtLimit} onChange={(event) => toggleLead(lead.leadId, event.target.checked)} /><span className="campaign-audience-lead"><strong>{lead.accountName}</strong><span>{lead.contactName ?? t('leadContacts.noPrimary')} · {lead.phone ?? t('leadContacts.noChannel')}</span><small>{t(`leadStatuses.${lead.status}`)} · {t(`leads.sources.${lead.source}`)}</small></span></label>
          {lead.blockers.length === 0 ? <span className="campaign-audience-eligible">{t('campaignAudience.eligible')}</span> : <ul>{lead.blockers.map((blocker) => <li key={blocker}>{t(`sdrReadiness.blockers.${blocker}`)}</li>)}</ul>}
        </li>
      })}</ul>}
      <div className="sdr-preview-pagination"><Button type="button" disabled={offset === 0 || loading} onClick={() => void load(Math.max(0, offset - CAMPAIGN_AUDIENCE_PAGE_SIZE))}>{t('common.previousPage')}</Button><span>{t('table.page', { page: Math.floor(offset / CAMPAIGN_AUDIENCE_PAGE_SIZE) + 1, pages: pageCount })}</span><Button type="button" disabled={!preview.pagination.hasNextPage || loading} onClick={() => void load(offset + CAMPAIGN_AUDIENCE_PAGE_SIZE)}>{t('common.nextPage')}</Button></div>
      <div className="campaign-audience-actions"><p className="form-hint">{t('campaignAudience.noSend')}</p><Button type="button" variant="primary" disabled={saving || loading} onClick={() => void save()}>{saving ? t('common.saving') : t('campaignAudience.save')}</Button></div>
    </>}
  </Modal>
}

function CampaignOperationalReadinessModal({ draft, onClose }: { draft: CampaignDraftDto; onClose: () => void }) {
  const { t } = useTranslation()
  const [readiness, setReadiness] = useState<CampaignOperationalReadinessDto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const load = useCallback(async () => {
    setLoading(true); setError(false)
    try { setReadiness(await campaignsApi.campaigns.operationalReadiness(draft.id)) }
    catch { setError(true) }
    finally { setLoading(false) }
  }, [draft.id])
  useEffect(() => { void load() }, [load])
  return <Modal open onOpenChange={(open) => { if (!open) onClose() }} title={t('campaignDrafts.readinessTitle', { campaign: draft.name })} description={t('campaignDrafts.readinessDescription')} closeLabel={t('common.close')} className="campaign-readiness-modal">
    {loading && !readiness ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : error ? <WorkspaceState kind="error" compact message={t('campaignDrafts.readinessFailed')}><Button onClick={() => void load()}>{t('campaignDrafts.retryReadiness')}</Button></WorkspaceState> : readiness && <>
      <p className="campaign-readiness-checked">{t('campaignDrafts.checkedAt', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(readiness.checkedAt)) })}</p>
      <dl className="campaign-readiness-list">
        <div><dt>{t('campaignDrafts.audience')}</dt><dd>{t('campaignAudience.savedCount', { count: readiness.audienceCount })}</dd></div>
        <div><dt>{t('campaignDrafts.channelActive')}</dt><dd>{t(readiness.channel.active ? 'campaignDrafts.enabled' : 'campaignDrafts.disabled')}</dd></div>
        <div><dt>{t('campaignDrafts.channelConfigured')}</dt><dd>{t(readiness.channel.configured ? 'campaignDrafts.configured' : 'campaignDrafts.notConfigured')}</dd></div>
        <div><dt>{t('campaignDrafts.channelHealth')}</dt><dd>{readiness.channel.health ? t(`channels.health.${readiness.channel.health}`) : t('campaignDrafts.healthNotChecked')}</dd></div>
        <div><dt>{t('campaignDrafts.sendingWindow')}</dt><dd>{t(readiness.sendingWindow.openNow ? 'campaignDrafts.windowOpen' : 'campaignDrafts.windowClosed', { start: readiness.sendingWindow.startsAt, end: readiness.sendingWindow.endsAt, timeZone: readiness.sendingWindow.timeZone })}</dd></div>
        <div><dt>{t('campaignDrafts.holidayCalendar')}</dt><dd>{readiness.holidayCalendar.noSendToday ? t('campaignDrafts.noSendToday', { name: readiness.holidayCalendar.todayName }) : t(readiness.holidayCalendar.configured ? 'campaignDrafts.calendarConfigured' : 'campaignDrafts.calendarPending', { count: readiness.holidayCalendar.datesCount })}</dd></div>
        <div><dt>{t('campaignDrafts.quota')}</dt><dd>{t('campaignDrafts.quotaStatus', { used: readiness.quota.channelUsed, channelLimit: readiness.quota.channelLimit, remaining: readiness.quota.channelRemaining, campaignLimit: readiness.quota.campaignLimit })}</dd></div>
      </dl>
      <WorkspaceState kind="partial" compact message={t(readiness.canQueue ? 'campaignDrafts.queueReady' : 'campaignDrafts.queueBlocked')} detail={t(readiness.canQueue ? 'campaignDrafts.queueReadyHint' : 'campaignDrafts.noQueue')} />
    </>}
  </Modal>
}

function CampaignHolidayCalendar() {
  const { t, i18n } = useTranslation()
  const [dates, setDates] = useState<CampaignNoSendDateDto[]>([])
  const [date, setDate] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { setDates(await campaignsApi.campaigns.listNoSendDates()) }
    catch { setError(t('campaignDrafts.calendarLoadFailed')) }
    finally { setLoading(false) }
  }, [t])
  useEffect(() => { void refresh() }, [refresh])
  const importNational = async () => {
    setSaving(true); setError('')
    try { setDates(await campaignsApi.campaigns.importNationalHolidays()) }
    catch { setError(t('campaignDrafts.calendarSaveFailed')) }
    finally { setSaving(false) }
  }
  const addDate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('')
    try { const created = await campaignsApi.campaigns.addNoSendDate({ date, name }); setDates((current) => [...current, created].sort((left, right) => left.date.localeCompare(right.date))); setDate(''); setName('') }
    catch { setError(t('campaignDrafts.calendarSaveFailed')) }
    finally { setSaving(false) }
  }
  const removeDate = async (id: string) => {
    setSaving(true); setError('')
    try { await campaignsApi.campaigns.deleteNoSendDate(id); setDates((current) => current.filter((item) => item.id !== id)) }
    catch { setError(t('campaignDrafts.calendarSaveFailed')) }
    finally { setSaving(false) }
  }
  return <section className="campaign-holiday-calendar" aria-labelledby="campaign-holiday-calendar-title">
    <div className="campaign-holiday-calendar-heading"><div><CalendarDays size={18} /><div><strong id="campaign-holiday-calendar-title">{t('campaignDrafts.calendarTitle')}</strong><p>{t('campaignDrafts.calendarDescription')}</p></div></div><Button type="button" disabled={saving || loading} onClick={() => void importNational()}>{saving ? t('common.saving') : t('campaignDrafts.importNational')}</Button></div>
    {error && <WorkspaceState kind="error" compact message={error}><Button type="button" onClick={() => void refresh()}>{t('sdrPreview.retry')}</Button></WorkspaceState>}
    <form className="campaign-holiday-calendar-form" onSubmit={(event) => void addDate(event)}>
      <label>{t('campaignDrafts.calendarDate')}<CalendarField mode="date" value={date} onValueChange={setDate} required /></label>
      <label>{t('campaignDrafts.calendarName')}<TextField value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required /></label>
      <Button type="submit" variant="primary" disabled={saving || loading || dates.length >= CAMPAIGN_NO_SEND_DATE_MAX}>{t('campaignDrafts.addCalendarDate')}</Button>
    </form>
    {loading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : dates.length === 0 ? <WorkspaceState kind="empty" compact message={t('campaignDrafts.calendarEmpty')} /> : <ul className="campaign-holiday-calendar-list">{dates.map((item) => <li key={item.id}><time dateTime={item.date}>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${item.date}T00:00:00.000Z`))}</time><strong>{item.name}</strong><IconButton label={t('campaignDrafts.removeCalendarDate', { name: item.name })} disabled={saving} onClick={() => void removeDate(item.id)}><Trash2 size={15} /></IconButton></li>)}</ul>}
  </section>
}

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
  const [readinessLead, setReadinessLead] = useState<LeadDto | null>(null)
  const [readiness, setReadiness] = useState<SdrReadinessDto | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(false)
  const [readinessError, setReadinessError] = useState(false)
  const [outreachDrafts, setOutreachDrafts] = useState<Record<string, OutreachDraft>>({})
  const [outreachSavingContactId, setOutreachSavingContactId] = useState<string | null>(null)
  const [sdrPreviewOpen, setSdrPreviewOpen] = useState(false)
  const [sdrPreview, setSdrPreview] = useState<SdrPreviewDto | null>(null)
  const [sdrPreviewChannels, setSdrPreviewChannels] = useState<SdrPreviewChannelDto[]>([])
  const [sdrPreviewChannelId, setSdrPreviewChannelId] = useState('')
  const [sdrPreviewLoading, setSdrPreviewLoading] = useState(false)
  const [sdrPreviewError, setSdrPreviewError] = useState(false)
  const [campaignDraftsOpen, setCampaignDraftsOpen] = useState(false)
  const [campaignTab, setCampaignTab] = useState<CampaignTab>('campaigns')
  const [campaignAudienceDraft, setCampaignAudienceDraft] = useState<CampaignDraftDto | null>(null)
  const [campaignReadinessDraft, setCampaignReadinessDraft] = useState<CampaignDraftDto | null>(null)
  const [campaignDrafts, setCampaignDrafts] = useState<CampaignDraftPageDto | null>(null)
  const [campaignDeliveryReview, setCampaignDeliveryReview] = useState<Awaited<ReturnType<typeof campaignsApi.campaigns.listDeliveryReview>> | null>(null)
  const [campaignReviewLoading, setCampaignReviewLoading] = useState(false)
  const [campaignReviewError, setCampaignReviewError] = useState('')
  const [campaignReviewSavingId, setCampaignReviewSavingId] = useState('')
  const [campaignReviewOffset, setCampaignReviewOffset] = useState(0)
  const [campaignChannels, setCampaignChannels] = useState<SdrPreviewChannelDto[]>([])
  const [campaignDraftsLoading, setCampaignDraftsLoading] = useState(false)
  const [campaignDraftSaving, setCampaignDraftSaving] = useState(false)
  const [campaignStartingId, setCampaignStartingId] = useState('')
  const [campaignStartedCount, setCampaignStartedCount] = useState<number | null>(null)
  const [campaignDraftError, setCampaignDraftError] = useState('')
  const [campaignDraftForm, setCampaignDraftForm] = useState<CreateCampaignDraftInput>({ name: '', openingMessage: '', channelId: '', windowStart: '09:00', windowEnd: '17:00', timeZone: CAMPAIGN_TIME_ZONE_DEFAULT, dailyMessageLimit: 50, minimumDelaySeconds: 30 })
  const [contactForm, setContactForm] = useState<CreateLeadContactInput>({ name: '', email: '', phone: '', jobTitle: '', isInterested: false, referralNote: '', notes: '' })
  const studentRangeInvalid = studentCountMin !== null && studentCountMax !== null && studentCountMin > studentCountMax

  const reviewSdrReadiness = async (lead: LeadDto) => {
    setReadinessLead(lead); setReadiness(null); setReadinessError(false); setReadinessLoading(true)
    try { setReadiness(await api.leads.sdrReadiness(lead.id)) }
    catch { setReadinessError(true) }
    finally { setReadinessLoading(false) }
  }
  const loadSdrPreview = async (offset = 0, channelId = sdrPreviewChannelId) => {
    setSdrPreviewLoading(true); setSdrPreviewError(false)
    try { setSdrPreview(await api.leads.sdrPreview({ channelId: channelId || undefined, limit: SDR_PREVIEW_PAGE_SIZE, offset })) }
    catch { setSdrPreviewError(true) }
    finally { setSdrPreviewLoading(false) }
  }
  const openSdrPreview = async () => {
    setSdrPreviewOpen(true); setSdrPreview(null); setSdrPreviewError(false); setSdrPreviewLoading(true)
    try {
      const channels = await api.leads.sdrPreviewChannels()
      const defaultChannelId = channels.find((channel) => channel.isActive && channel.isConfigured)?.id ?? ''
      setSdrPreviewChannels(channels); setSdrPreviewChannelId(defaultChannelId)
      setSdrPreview(await api.leads.sdrPreview({ channelId: defaultChannelId || undefined, limit: SDR_PREVIEW_PAGE_SIZE, offset: 0 }))
    } catch { setSdrPreviewError(true) }
    finally { setSdrPreviewLoading(false) }
  }
  const loadCampaignDrafts = async (offset = 0) => {
    setCampaignDraftsLoading(true); setCampaignDraftError('')
    try { setCampaignDrafts(await api.campaigns.listDrafts({ limit: 25, offset })) }
    catch { setCampaignDraftError(t('campaignDrafts.loadFailed')) }
    finally { setCampaignDraftsLoading(false) }
  }
  const openCampaignDrafts = async () => {
    setCampaignDraftsOpen(true); setCampaignDraftsLoading(true); setCampaignDraftError('')
    try {
      const [channels, drafts] = await Promise.all([api.leads.sdrPreviewChannels(), api.campaigns.listDrafts({ limit: 25, offset: 0 })])
      const firstConfigured = channels.find((channel) => channel.isActive && channel.isConfigured)
      setCampaignChannels(channels); setCampaignDrafts(drafts)
      setCampaignDraftForm((current) => ({ ...current, channelId: current.channelId || firstConfigured?.id || '' }))
    } catch { setCampaignDraftError(t('campaignDrafts.loadFailed')) }
    finally { setCampaignDraftsLoading(false) }
  }
  const createCampaignDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setCampaignDraftSaving(true); setCampaignDraftError('')
    try {
      await api.campaigns.createDraft(campaignDraftForm)
      setCampaignDraftForm((current) => ({ ...current, name: '' }))
      await loadCampaignDrafts(0)
    } catch { setCampaignDraftError(t('campaignDrafts.saveFailed')) }
    finally { setCampaignDraftSaving(false) }
  }
  const startCampaign = async (draft: CampaignDraftDto) => {
    setCampaignStartingId(draft.id); setCampaignDraftError(''); setCampaignStartedCount(null)
    try {
      const result = await api.campaigns.startDraft(draft.id)
      setCampaignStartedCount(result.queuedCount)
      await loadCampaignDrafts(campaignDrafts?.pagination.offset ?? 0)
    } catch (error) {
      setCampaignDraftError(error instanceof ApiError && error.code === 'CAMPAIGN_AUDIENCE_LEAD_INELIGIBLE' ? t('campaignDrafts.ineligible') : error instanceof ApiError && error.code === 'CAMPAIGN_NOT_READY' ? t('campaignDrafts.notReady') : t('campaignDrafts.startFailed'))
    } finally { setCampaignStartingId('') }
  }
  const changeCampaignStatus = async (draft: CampaignDraftDto, action: 'pause' | 'resume') => {
    setCampaignStartingId(draft.id); setCampaignDraftError('')
    try {
      if (action === 'pause') await api.campaigns.pauseDraft(draft.id)
      else await api.campaigns.resumeDraft(draft.id)
      await loadCampaignDrafts(campaignDrafts?.pagination.offset ?? 0)
    } catch { setCampaignDraftError(t('campaignDrafts.statusChangeFailed')) }
    finally { setCampaignStartingId('') }
  }

  const loadCampaignDeliveryReview = async (offset = 0) => {
    setCampaignReviewOffset(offset)
    setCampaignReviewError('')
    setCampaignReviewLoading(true)
    try { setCampaignDeliveryReview(await campaignsApi.campaigns.listDeliveryReview({ limit: 25, offset })) }
    catch { setCampaignReviewError(t('campaignDrafts.reviewLoadFailed')) }
    finally { setCampaignReviewLoading(false) }
  }

  const confirmCampaignDelivery = async (outboxEventId: string) => {
    setCampaignReviewSavingId(outboxEventId)
    try {
      await campaignsApi.campaigns.confirmDeliverySent(outboxEventId)
      await loadCampaignDeliveryReview(campaignReviewOffset)
    } catch { setCampaignReviewError(t('campaignDrafts.reviewConfirmFailed')) }
    finally { setCampaignReviewSavingId('') }
  }

  const selectCampaignTab = (tab: CampaignTab) => {
    setCampaignTab(tab)
    if (tab === 'delivery-review' && !campaignDeliveryReview && !campaignReviewLoading) void loadCampaignDeliveryReview()
  }

  const handleCampaignTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const tabs: CampaignTab[] = ['campaigns', 'calendar', 'delivery-review']
    const index = tabs.indexOf(campaignTab)
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length
    const nextTab = tabs[nextIndex]
    selectCampaignTab(nextTab)
    document.getElementById(`campaign-tab-${nextTab}`)?.focus()
  }

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

  const updateOutreachDraft = (contact: LeadContactDto, update: Partial<OutreachDraft>) => {
    setOutreachDrafts((current) => {
      const previous = current[contact.id] ?? { decision: contact.outreachDecision, basis: contact.outreachBasis ?? '', evidence: contact.outreachEvidence ?? '' }
      return { ...current, [contact.id]: { ...previous, ...update } }
    })
  }
  const saveContactOutreachReview = async (contact: LeadContactDto) => {
    if (!contactsLead) return
    const draft = outreachDrafts[contact.id] ?? { decision: contact.outreachDecision, basis: contact.outreachBasis ?? '', evidence: contact.outreachEvidence ?? '' }
    if (draft.decision !== CONTACT_OUTREACH_DECISION.pending && (!draft.basis || draft.evidence.trim().length < 3)) return
    const basis = CONTACT_OUTREACH_BASIS_VALUES.find((value) => value === draft.basis)
    setOutreachSavingContactId(contact.id); setContactsError('')
    try {
      if (draft.decision === CONTACT_OUTREACH_DECISION.pending) await api.leads.reviewContactOutreach(contactsLead.id, contact.id, { decision: CONTACT_OUTREACH_DECISION.pending })
      else if (draft.decision === CONTACT_OUTREACH_DECISION.approved && basis) await api.leads.reviewContactOutreach(contactsLead.id, contact.id, { decision: CONTACT_OUTREACH_DECISION.approved, basis, evidence: draft.evidence.trim() })
      else if (basis) await api.leads.reviewContactOutreach(contactsLead.id, contact.id, { decision: CONTACT_OUTREACH_DECISION.blocked, basis, evidence: draft.evidence.trim() })
      setLeadContacts(await api.leads.contacts(contactsLead.id))
      setOutreachDrafts((current) => { const next = { ...current }; delete next[contact.id]; return next })
      setRefreshVersion((version) => version + 1)
    } catch { setContactsError(t('contactOutreach.saveFailed')) }
    finally { setOutreachSavingContactId(null) }
  }

  const columns: DataTableColumn<LeadDto, LeadSortBy>[] = [
    { id: 'accountName', label: t('leads.companyContact'), render: (lead) => <><strong>{lead.accountName}</strong><small className="lead-account-profile">{lead.accountMarketSegment ? t(`accountProfileFields.marketSegments.${lead.accountMarketSegment}`) : t('accountProfileFields.unclassifiedMarketSegment')}{lead.accountStudentCount !== null && <span>{t('accountProfileFields.studentsShort', { count: new Intl.NumberFormat(i18n.language).format(lead.accountStudentCount) })}</span>}</small><span className="lead-primary-contact"><small className="lead-contact-name">{lead.contactName || t('leadContacts.noPrimary')}</small><IconButton label={t('leadContacts.manage')} onClick={() => void openContacts(lead)}><Users size={15} /></IconButton><IconButton label={t('sdrReadiness.reviewFor', { company: lead.accountName })} onClick={() => void reviewSdrReadiness(lead)}><Bot size={15} /></IconButton></span></> },
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
      <div className="lead-actions"><Button type="button" onClick={() => void openCampaignDrafts()}><Megaphone size={16} />{t('campaignDrafts.open')}</Button><Button type="button" onClick={openSdrPreview}><Bot size={16} />{t('sdrPreview.open')}</Button><Button type="button" className="refresh" onClick={() => setRefreshVersion((version) => version + 1)} aria-label={t('leads.refresh')}><RefreshCw size={16} /></Button><Button type="button" className="primary add-lead" onClick={() => setShowForm((value) => !value)}><Plus size={16} />{showForm ? t('leads.closeForm') : t('leads.addLead')}</Button></div>
    </header>
    <Modal open={campaignDraftsOpen} onOpenChange={(open) => { setCampaignDraftsOpen(open); if (!open) { setCampaignDraftError(''); setCampaignDrafts(null); setCampaignChannels([]); setCampaignTab('campaigns') } }} title={t('campaignDrafts.title')} description={t('campaignDrafts.description')} closeLabel={t('common.close')} className="campaign-drafts-modal">
      {campaignDraftError && <WorkspaceState kind="error" compact message={campaignDraftError}><Button type="button" onClick={() => void loadCampaignDrafts(campaignDrafts?.pagination.offset ?? 0)}>{t('sdrPreview.retry')}</Button></WorkspaceState>}
      {campaignDraftsLoading && !campaignDrafts ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : <>
      <div className="campaign-workspace-tabs" role="tablist" aria-label={t('campaignDrafts.sections')}>
        <Button type="button" role="tab" id="campaign-tab-campaigns" aria-controls="campaign-panel-campaigns" aria-selected={campaignTab === 'campaigns'} tabIndex={campaignTab === 'campaigns' ? 0 : -1} className={campaignTab === 'campaigns' ? 'selected' : ''} onKeyDown={handleCampaignTabKeyDown} onClick={() => selectCampaignTab('campaigns')}>{t('campaignDrafts.campaignsTab')}</Button>
        <Button type="button" role="tab" id="campaign-tab-calendar" aria-controls="campaign-panel-calendar" aria-selected={campaignTab === 'calendar'} tabIndex={campaignTab === 'calendar' ? 0 : -1} className={campaignTab === 'calendar' ? 'selected' : ''} onKeyDown={handleCampaignTabKeyDown} onClick={() => selectCampaignTab('calendar')}>{t('campaignDrafts.calendarTab')}</Button>
        <Button type="button" role="tab" id="campaign-tab-delivery-review" aria-controls="campaign-panel-delivery-review" aria-selected={campaignTab === 'delivery-review'} tabIndex={campaignTab === 'delivery-review' ? 0 : -1} className={campaignTab === 'delivery-review' ? 'selected' : ''} onKeyDown={handleCampaignTabKeyDown} onClick={() => selectCampaignTab('delivery-review')}>{t('campaignDrafts.deliveryReview')}</Button>
      </div>
      <div role="tabpanel" id="campaign-panel-campaigns" aria-labelledby="campaign-tab-campaigns" hidden={campaignTab !== 'campaigns'}>
        <form className="campaign-draft-form" onSubmit={(event) => void createCampaignDraft(event)}>
          <div className="campaign-draft-form-heading"><strong>{t('campaignDrafts.newDraft')}</strong><p>{t('campaignDrafts.formHint')}</p></div>
          <label>{t('campaignDrafts.name')}<TextField value={campaignDraftForm.name} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={120} required /></label>
          <label>{t('campaignDrafts.channel')}<SelectField value={campaignDraftForm.channelId} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, channelId: event.target.value }))} required><option value="">{t('campaignDrafts.chooseChannel')}</option>{campaignChannels.map((channel) => <option key={channel.id} value={channel.id} disabled={!channel.isActive || !channel.isConfigured}>{channel.displayName} · {channel.phoneNumber}{!channel.isActive ? ` · ${t('sdrPreview.channelInactive')}` : !channel.isConfigured ? ` · ${t('sdrPreview.channelUnconfigured')}` : ''}</option>)}</SelectField></label>
          {campaignChannels.length === 0 && <p className="form-hint">{t('sdrPreview.noChannels')}</p>}
          <label>{t('campaignDrafts.openingMessage')}<TextareaField value={campaignDraftForm.openingMessage} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, openingMessage: event.target.value }))} minLength={1} maxLength={4096} rows={4} required /></label>
          <div className="campaign-draft-fields">
            <label>{t('campaignDrafts.windowStart')}<TextField type="time" value={campaignDraftForm.windowStart} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, windowStart: event.target.value }))} required /></label>
            <label>{t('campaignDrafts.windowEnd')}<TextField type="time" value={campaignDraftForm.windowEnd} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, windowEnd: event.target.value }))} required /></label>
            <label>{t('campaignDrafts.dailyLimit')}<NumericField mode="integer" min={1} max={500} value={campaignDraftForm.dailyMessageLimit} onValueChange={(value) => setCampaignDraftForm((current) => ({ ...current, dailyMessageLimit: value ?? 0 }))} required /></label>
            <label>{t('campaignDrafts.minimumDelay')}<NumericField mode="integer" min={5} max={300} value={campaignDraftForm.minimumDelaySeconds} onValueChange={(value) => setCampaignDraftForm((current) => ({ ...current, minimumDelaySeconds: value ?? 0 }))} required /></label>
          </div>
          <label>{t('campaignDrafts.timeZone')}<TextField value={campaignDraftForm.timeZone} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, timeZone: event.target.value }))} maxLength={80} required /></label>
          <Button type="submit" variant="primary" disabled={campaignDraftSaving || !campaignDraftForm.channelId}>{campaignDraftSaving ? t('common.saving') : t('campaignDrafts.saveDraft')}</Button>
          <p className="form-hint">{t('campaignDrafts.draftOnly')}</p>
        </form>
        <section className="campaign-draft-list" aria-label={t('campaignDrafts.savedDrafts')}>
          <div className="campaign-draft-list-heading"><div><strong>{t('campaignDrafts.savedDrafts')}</strong><span>{t('campaignDrafts.count', { count: campaignDrafts?.pagination.total ?? 0 })}</span></div></div>
          <p className="form-hint">{t('campaignDrafts.pauseHint')}</p>
          {campaignStartedCount !== null && <p className="success-message" role="status">{t('campaignDrafts.started', { count: campaignStartedCount })}</p>}
          {!campaignDraftsLoading && campaignDrafts?.data.length === 0 ? <WorkspaceState kind="empty" message={t('campaignDrafts.empty')} /> : <ul>{campaignDrafts?.data.map((draft) => <li key={draft.id}><div><strong>{draft.name}</strong><span>{draft.channelName} · {draft.channelPhoneNumber}</span><small>{t('campaignDrafts.schedule', { start: draft.windowStart, end: draft.windowEnd, timeZone: draft.timeZone })}</small></div><div><span>{t('campaignDrafts.dailyLimitValue', { count: draft.dailyMessageLimit })}</span><span>{t('campaignDrafts.delayValue', { count: draft.minimumDelaySeconds })}</span><span>{t('campaignAudience.savedCount', { count: draft.audienceLeadCount })}</span><b>{t(`campaignDrafts.status.${draft.status}`)}</b><Button type="button" onClick={() => setCampaignReadinessDraft(draft)}>{t('campaignDrafts.checkReadiness')}</Button><Button type="button" onClick={() => setCampaignAudienceDraft(draft)} disabled={draft.status !== CAMPAIGN_DRAFT_STATUS.draft}>{t('campaignAudience.select')}</Button>{draft.status === CAMPAIGN_DRAFT_STATUS.active && <Button type="button" disabled={campaignStartingId !== ''} onClick={() => void changeCampaignStatus(draft, 'pause')}>{campaignStartingId === draft.id ? t('common.saving') : t('campaignDrafts.pause')}</Button>}{draft.status === CAMPAIGN_DRAFT_STATUS.paused && <Button type="button" variant="primary" disabled={campaignStartingId !== ''} onClick={() => void changeCampaignStatus(draft, 'resume')}>{campaignStartingId === draft.id ? t('common.saving') : t('campaignDrafts.resume')}</Button>}{draft.status === CAMPAIGN_DRAFT_STATUS.draft && <Button type="button" variant="primary" disabled={draft.audienceLeadCount === 0 || campaignStartingId !== ''} onClick={() => void startCampaign(draft)}>{campaignStartingId === draft.id ? t('common.saving') : t('campaignDrafts.start')}</Button>}</div></li>)}</ul>}
          {campaignDrafts && <div className="sdr-preview-pagination"><Button type="button" disabled={campaignDrafts.pagination.offset === 0 || campaignDraftsLoading} onClick={() => void loadCampaignDrafts(Math.max(0, campaignDrafts.pagination.offset - campaignDrafts.pagination.limit))}>{t('common.previousPage')}</Button><span>{t('table.page', { page: Math.floor(campaignDrafts.pagination.offset / campaignDrafts.pagination.limit) + 1, pages: Math.max(1, Math.ceil(campaignDrafts.pagination.total / campaignDrafts.pagination.limit)) })}</span><Button type="button" disabled={!campaignDrafts.pagination.hasNextPage || campaignDraftsLoading} onClick={() => void loadCampaignDrafts(campaignDrafts.pagination.offset + campaignDrafts.pagination.limit)}>{t('common.nextPage')}</Button></div>}
        </section>
      </div>
      <div role="tabpanel" id="campaign-panel-calendar" aria-labelledby="campaign-tab-calendar" hidden={campaignTab !== 'calendar'}><CampaignHolidayCalendar /></div>
      <div role="tabpanel" id="campaign-panel-delivery-review" aria-labelledby="campaign-tab-delivery-review" hidden={campaignTab !== 'delivery-review'}>
        <section className="campaign-delivery-review" aria-label={t('campaignDrafts.deliveryReview')}>
          <p className="form-hint">{t('campaignDrafts.reviewSafety')}</p>
          {campaignReviewError && <WorkspaceState kind="error" compact message={campaignReviewError}><Button type="button" disabled={campaignReviewLoading} onClick={() => void loadCampaignDeliveryReview(campaignReviewOffset)}>{t('sdrPreview.retry')}</Button></WorkspaceState>}
          {!campaignReviewError && (campaignReviewLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : !campaignDeliveryReview || campaignDeliveryReview.data.length === 0 ? <WorkspaceState kind="empty" message={t('campaignDrafts.reviewEmpty')} /> : <><ul>{campaignDeliveryReview.data.map((item) => <li key={item.outboxEventId}><div><strong>{item.campaignName} · {item.accountName || t('campaignDrafts.unknownLead')}</strong><span>{item.contactName ?? '—'} · {item.phone ?? '—'}</span><small>{t('campaignDrafts.reviewState', { state: item.deliveryState ?? t('campaignDrafts.noMessage'), attempts: item.attempts })}</small></div><Button type="button" variant="primary" disabled={!item.leadId || !item.deliveryState || campaignReviewSavingId !== ''} onClick={() => void confirmCampaignDelivery(item.outboxEventId)}>{campaignReviewSavingId === item.outboxEventId ? t('common.saving') : t('campaignDrafts.confirmSent')}</Button></li>)}</ul><div className="sdr-preview-pagination"><Button type="button" disabled={campaignReviewLoading || campaignReviewOffset === 0} onClick={() => void loadCampaignDeliveryReview(Math.max(0, campaignReviewOffset - 25))}>{t('common.previousPage')}</Button><span>{t('table.page', { page: Math.floor(campaignReviewOffset / 25) + 1, pages: Math.max(1, Math.ceil(campaignDeliveryReview.pagination.total / 25)) })}</span><Button type="button" disabled={campaignReviewLoading || !campaignDeliveryReview.pagination.hasNextPage} onClick={() => void loadCampaignDeliveryReview(campaignReviewOffset + 25)}>{t('common.nextPage')}</Button></div></>)}
        </section>
      </div>
      </>}
    </Modal>
    {campaignAudienceDraft && <CampaignAudienceEditor draft={campaignAudienceDraft} onClose={() => setCampaignAudienceDraft(null)} onSaved={() => void loadCampaignDrafts(campaignDrafts?.pagination.offset ?? 0)} />}
    {campaignReadinessDraft && <CampaignOperationalReadinessModal draft={campaignReadinessDraft} onClose={() => setCampaignReadinessDraft(null)} />}
    <Modal open={sdrPreviewOpen} onOpenChange={(open) => { setSdrPreviewOpen(open); if (!open) { setSdrPreview(null); setSdrPreviewError(false); setSdrPreviewChannels([]); setSdrPreviewChannelId('') } }} title={t('sdrPreview.title')} description={t('sdrPreview.description')} closeLabel={t('common.close')} className="sdr-preview-modal">
      {sdrPreviewError ? <WorkspaceState kind="error" compact message={t('sdrPreview.loadFailed')}><Button onClick={() => void loadSdrPreview(sdrPreview?.pagination.offset ?? 0)}>{t('sdrPreview.retry')}</Button></WorkspaceState> : sdrPreviewLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : sdrPreview && <>
        <label className="sdr-preview-channel">{t('sdrPreview.channel')}<SelectField value={sdrPreviewChannelId} onChange={(event) => { const channelId = event.target.value; setSdrPreviewChannelId(channelId); void loadSdrPreview(0, channelId) }}><option value="">{t('sdrPreview.chooseChannel')}</option>{sdrPreviewChannels.map((channel) => <option key={channel.id} value={channel.id} disabled={!channel.isActive || !channel.isConfigured}>{channel.displayName} · {channel.phoneNumber} · {t(channel.isActive ? channel.isConfigured ? 'sdrPreview.channelReady' : 'sdrPreview.channelUnconfigured' : 'sdrPreview.channelInactive')}</option>)}</SelectField></label>
        {sdrPreviewChannels.length === 0 && <p className="form-hint">{t('sdrPreview.noChannels')}</p>}
        <div className="sdr-preview-summary"><strong>{t('sdrPreview.pageCount', { count: sdrPreview.leads.length, total: sdrPreview.pagination.total })}</strong><span>{t('sdrPreview.withoutBlockers', { count: sdrPreview.pageSummary.withoutBlockers })}</span><span>{t('sdrPreview.blocked', { count: sdrPreview.pageSummary.blocked })}</span></div>
        {sdrPreview.leads.length === 0 ? <WorkspaceState kind="empty" message={t('sdrPreview.empty')} /> : <ul className="sdr-preview-list">{sdrPreview.leads.map((lead) => <li key={lead.leadId}><div><strong>{lead.accountName}</strong><small>{lead.contactName ?? t('leadContacts.noPrimary')} · {t(`leads.sources.${lead.source}`)}</small></div>{lead.blockers.length === 0 ? <span className="sdr-preview-ready">{t('sdrPreview.ready')}</span> : <ul>{lead.blockers.map((blocker) => <li key={blocker}>{t(`sdrReadiness.blockers.${blocker}`)}</li>)}</ul>}</li>)}</ul>}
        <div className="sdr-preview-pagination"><Button disabled={sdrPreview.pagination.offset === 0} onClick={() => void loadSdrPreview(Math.max(0, sdrPreview.pagination.offset - sdrPreview.pagination.limit))}>{t('common.previousPage')}</Button><span>{t('table.page', { page: Math.floor(sdrPreview.pagination.offset / sdrPreview.pagination.limit) + 1, pages: Math.max(1, Math.ceil(sdrPreview.pagination.total / sdrPreview.pagination.limit)) })}</span><Button disabled={!sdrPreview.pagination.hasNextPage} onClick={() => void loadSdrPreview(sdrPreview.pagination.offset + sdrPreview.pagination.limit)}>{t('common.nextPage')}</Button></div>
        <p className="form-hint">{t('sdrPreview.noSend')}</p>
      </>}
    </Modal>
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
            {(() => {
              const draft = outreachDrafts[contact.id] ?? { decision: contact.outreachDecision, basis: contact.outreachBasis ?? '', evidence: contact.outreachEvidence ?? '' }
              const requiresEvidence = draft.decision !== CONTACT_OUTREACH_DECISION.pending
              return <div className="lead-outreach-review"><strong>{t('contactOutreach.title')}</strong><div className="lead-outreach-review-fields">
                <label>{t('contactOutreach.decision')}<SelectField value={draft.decision} onChange={(event) => { const decision = CONTACT_OUTREACH_DECISION_VALUES.find((value) => value === event.target.value); if (decision) updateOutreachDraft(contact, { decision, basis: decision === CONTACT_OUTREACH_DECISION.pending ? '' : draft.basis, evidence: decision === CONTACT_OUTREACH_DECISION.pending ? '' : draft.evidence }) }}><option value={CONTACT_OUTREACH_DECISION.pending}>{t('contactOutreach.decisions.pending')}</option><option value={CONTACT_OUTREACH_DECISION.approved}>{t('contactOutreach.decisions.approved')}</option><option value={CONTACT_OUTREACH_DECISION.blocked}>{t('contactOutreach.decisions.blocked')}</option></SelectField></label>
                {requiresEvidence && <><label>{t('contactOutreach.basis')}<SelectField value={draft.basis} onChange={(event) => { const basis = CONTACT_OUTREACH_BASIS_VALUES.find((value) => value === event.target.value); if (basis) updateOutreachDraft(contact, { basis }) }}><option value="">{t('contactOutreach.chooseBasis')}</option>{CONTACT_OUTREACH_BASIS_VALUES.map((basis) => <option key={basis} value={basis}>{t(`contactOutreach.bases.${basis}`)}</option>)}</SelectField></label><label>{t('contactOutreach.evidence')}<TextareaField value={draft.evidence} onChange={(event) => updateOutreachDraft(contact, { evidence: event.target.value })} maxLength={2000} minLength={3} required /></label></>}
              </div><div className="lead-outreach-review-footer">{contact.outreachReviewedAt && <small>{t('contactOutreach.reviewedBy', { name: contact.outreachReviewedByName ?? t('leadAssignment.unknownAssignee'), date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(contact.outreachReviewedAt)) })}</small>}<Button type="button" disabled={outreachSavingContactId === contact.id || (requiresEvidence && (!draft.basis || draft.evidence.trim().length < 3))} onClick={() => void saveContactOutreachReview(contact)}>{outreachSavingContactId === contact.id ? t('common.saving') : t('contactOutreach.save')}</Button></div></div>
            })()}
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
    <Modal open={readinessLead !== null} onOpenChange={(open) => { if (!open) { setReadinessLead(null); setReadiness(null); setReadinessError(false) } }} title={t('sdrReadiness.title', { company: readinessLead?.accountName ?? '' })} description={t('sdrReadiness.description')} closeLabel={t('common.close')}>
      {readinessLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : readinessError ? <WorkspaceState kind="error" compact message={t('sdrReadiness.loadFailed')} /> : readiness && <><p>{t('sdrReadiness.summary', { count: readiness.blockers.length })}</p><ul className="sdr-readiness-list">{readiness.blockers.map((blocker) => <li key={blocker}>{t(`sdrReadiness.blockers.${blocker}`)}</li>)}</ul><p className="form-hint">{t('sdrReadiness.noSend')}</p></>}
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
