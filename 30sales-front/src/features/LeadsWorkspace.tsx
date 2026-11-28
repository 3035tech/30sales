import { Button, CalendarField, CheckboxField, IconButton, NumericField, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { PhoneField } from '../components/ui/PhoneField'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, CalendarDays, Check, ChevronLeft, ChevronRight, Megaphone, Plus, RefreshCw, Search, Sparkles, Star, Trash2, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import { notifySystemAlert, SYSTEM_ALERT_KIND } from '../components/ui/SystemAlert'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ACCOUNT_SEGMENT_FILTER, api, ApiError, CONTACT_OUTREACH_BASIS, CONTACT_OUTREACH_BASIS_VALUES, CONTACT_OUTREACH_DECISION, CONTACT_OUTREACH_DECISION_VALUES, LEAD_SOURCE_VALUES, SDR_PREVIEW_PAGE_SIZE, parseLeadStatus, type AccountSegmentDto, type BusinessLineDto, type CreateLeadContactInput, type CreateLeadInput, type CreateQualificationFactInput, type LeadAssigneeDto, type LeadContactDto, type LeadDto, type LeadDuplicateCandidateDto, type LeadSortBy, type LeadStatus, type QualificationFactDto, type QualificationFactPageDto, type QualificationSuggestionDto, type SdrPreviewChannelDto, type SdrPreviewDto, type SdrReadinessDto } from '../lib/api'
import { ACCOUNT_MARKET_FILTER, ACCOUNT_MARKET_SEGMENTS } from '../lib/accountConstants'
import { LEAD_QUALIFICATION_FACT_KEY, LEAD_QUALIFICATION_FACT_KEYS, LEAD_QUALIFICATION_FACT_LIMITS, LEAD_QUALIFICATION_FACT_SOURCE, LEAD_QUALIFICATION_FACT_STATE, LEAD_QUALIFICATION_FACT_STATES, LEAD_QUALIFICATION_SUGGESTION_ERROR_CODE } from '../lib/leadQualificationConstants'
import { CAMPAIGN_QUEUE_PAGE_SIZE, CAMPAIGN_WORKSPACE_TAB, CAMPAIGN_WORKSPACE_TABS } from '../lib/campaignConstants'
import { PAGINATION_MINIMUM_PAGE_COUNT, PAGINATION_OFFSET_START } from '../lib/paginationConstants'
import { CAMPAIGN_DELIVERY_REVIEW_ALREADY_SENT_STATES, CAMPAIGN_DELIVERY_REVIEW_PAGE_SIZE, EMPTY_IDENTIFIER } from '../lib/inboxConstants'
import { ASYNC_RESULT_STATUS, LEAD_ACCOUNT_CONTACT_LIMITS, LEAD_CONTACT_ERROR_CODE, LEAD_CONTACT_PRIMARY_SORT_ORDER } from '../lib/leadContactConstants'
import { CAMPAIGN_AUDIENCE_MAX_LEADS, CAMPAIGN_AUDIENCE_PAGE_SIZE, CAMPAIGN_DRAFT_STATUS, CAMPAIGN_NO_SEND_DATE_MAX, CAMPAIGN_TIME_ZONE_DEFAULT, api as campaignsApi, type CampaignAudiencePreviewDto, type CampaignDraftDto, type CampaignDraftPageDto, type CampaignNoSendDateDto, type CampaignOperationalReadinessDto, type CreateCampaignDraftInput } from '../lib/api'
import i18n from '../lib/i18n'
import './LeadsWorkspace.css'
import './LeadDuplicateReview.css'
import './LeadProfile.css'

const statusOrder: LeadStatus[] = ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']
const sourceOrder: NonNullable<CreateLeadInput['source']>[] = [...LEAD_SOURCE_VALUES]
const qualificationSuggestionKey = (suggestion: QualificationSuggestionDto) => `${suggestion.factKey}:${suggestion.sourceMessageId}:${suggestion.evidence}`
const formatCampaignCount = (value: number) => new Intl.NumberFormat(i18n.language).format(value)
type SortDirection = 'asc' | 'desc'
type OutreachDecision = (typeof CONTACT_OUTREACH_DECISION)[keyof typeof CONTACT_OUTREACH_DECISION]
type OutreachBasis = (typeof CONTACT_OUTREACH_BASIS)[keyof typeof CONTACT_OUTREACH_BASIS]
type OutreachDraft = { decision: OutreachDecision; basis: OutreachBasis | ''; evidence: string }
type CampaignTab = (typeof CAMPAIGN_WORKSPACE_TABS)[number]
type AccountContactPage = Awaited<ReturnType<typeof api.leads.accountContacts>>
const defaultQualificationFactForm: CreateQualificationFactInput = { factKey: LEAD_QUALIFICATION_FACT_KEY.need, value: '', state: LEAD_QUALIFICATION_FACT_STATE.confirmed, source: LEAD_QUALIFICATION_FACT_SOURCE.manual, evidence: '' }

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
  const pageCount = Math.max(PAGINATION_MINIMUM_PAGE_COUNT, Math.ceil((preview?.pagination.total ?? 0) / CAMPAIGN_AUDIENCE_PAGE_SIZE))
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
      <div className="sdr-preview-pagination"><Button type="button" aria-label={t('table.previous')} disabled={offset === PAGINATION_OFFSET_START || loading} onClick={() => void load(Math.max(PAGINATION_OFFSET_START, offset - CAMPAIGN_AUDIENCE_PAGE_SIZE))}><ChevronLeft size={16} aria-hidden="true" /></Button><span>{t('table.page', { page: Math.floor(offset / CAMPAIGN_AUDIENCE_PAGE_SIZE) + 1, pages: pageCount })}</span><Button type="button" aria-label={t('table.next')} disabled={!preview.pagination.hasNextPage || loading} onClick={() => void load(offset + CAMPAIGN_AUDIENCE_PAGE_SIZE)}><ChevronRight size={16} aria-hidden="true" /></Button></div>
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
        <div><dt>{t('campaignDrafts.quota')}</dt><dd>{t('campaignDrafts.quotaStatus', { used: readiness.quota.channelUsed, reserved: readiness.quota.channelReserved, channelLimit: readiness.quota.channelLimit, remaining: readiness.quota.channelRemaining, campaignLimit: readiness.quota.campaignLimit })}</dd></div>
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

export function LeadsWorkspace({ initialSearch = '', onOpenInbox }: { initialSearch?: string; onOpenInbox: (conversationId: string) => void }) {
  const { t } = useTranslation()
  const contactsRequestId = useRef(0)
  const [searchParams, setSearchParams] = useSearchParams()
  const globalBusinessLineId = searchParams.get('businessLineId') ?? ''
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
  const [businessLines, setBusinessLines] = useState<BusinessLineDto[]>([])
  const [businessLineFilter, setBusinessLineFilter] = useState('')
  const [sortBy, setSortBy] = useState<LeadSortBy>('nextActionAt')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [pageSize, setPageSize] = useState(25)
  const [offset, setOffset] = useState(0)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [statusUpdate, setStatusUpdate] = useState<{ lead: LeadDto; status: LeadStatus } | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [form, setForm] = useState<CreateLeadInput>({ businessLineId: '', accountName: '', contactName: '', email: '', phone: '', source: 'manual' })
  const [duplicateCandidates, setDuplicateCandidates] = useState<LeadDuplicateCandidateDto[] | null>(null)
  const [duplicateOverrideReason, setDuplicateOverrideReason] = useState('')
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)
  const [contactsLead, setContactsLead] = useState<LeadDto | null>(null)
  const [leadContacts, setLeadContacts] = useState<LeadContactDto[]>([])
  const [qualificationFacts, setQualificationFacts] = useState<QualificationFactPageDto | null>(null)
  const [qualificationFactsLoading, setQualificationFactsLoading] = useState(false)
  const [qualificationFactsSaving, setQualificationFactsSaving] = useState(false)
  const [qualificationFactsError, setQualificationFactsError] = useState('')
  const [qualificationSuggestions, setQualificationSuggestions] = useState<QualificationSuggestionDto[]>([])
  const [qualificationSuggestionsGenerated, setQualificationSuggestionsGenerated] = useState(false)
  const [qualificationSuggestionsLoading, setQualificationSuggestionsLoading] = useState(false)
  const [qualificationSuggestionsError, setQualificationSuggestionsError] = useState('')
  const [savingQualificationSuggestionKey, setSavingQualificationSuggestionKey] = useState('')
  const [qualificationFactsOffset, setQualificationFactsOffset] = useState<number>(LEAD_QUALIFICATION_FACT_LIMITS.offsetStart)
  const [qualificationFactForm, setQualificationFactForm] = useState<CreateQualificationFactInput>(defaultQualificationFactForm)
  const [accountContacts, setAccountContacts] = useState<AccountContactPage | null>(null)
  const [accountContactsLoading, setAccountContactsLoading] = useState(false)
  const [accountContactsError, setAccountContactsError] = useState('')
  const [accountContactsOffset, setAccountContactsOffset] = useState<number>(LEAD_ACCOUNT_CONTACT_LIMITS.offsetStart)
  const [linkingAccountContactId, setLinkingAccountContactId] = useState('')

  useEffect(() => { setBusinessLineFilter(globalBusinessLineId); setOffset(0) }, [globalBusinessLineId])
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
  const [campaignTab, setCampaignTab] = useState<CampaignTab>(() => {
    const savedTab = window.sessionStorage.getItem('30sales-campaign-workspace-tab')
    return CAMPAIGN_WORKSPACE_TABS.includes(savedTab as CampaignTab) ? savedTab as CampaignTab : CAMPAIGN_WORKSPACE_TAB.campaigns
  })
  const [campaignAudienceDraft, setCampaignAudienceDraft] = useState<CampaignDraftDto | null>(null)
  const [campaignReadinessDraft, setCampaignReadinessDraft] = useState<CampaignDraftDto | null>(null)
  const [campaignDrafts, setCampaignDrafts] = useState<CampaignDraftPageDto | null>(null)
  const [campaignPerformance, setCampaignPerformance] = useState<Awaited<ReturnType<typeof campaignsApi.campaigns.performance>> | null>(null)
  const [campaignLeadPerformance, setCampaignLeadPerformance] = useState<Awaited<ReturnType<typeof campaignsApi.campaigns.performanceLeads>> | null>(null)
  const [campaignPerformanceDraftId, setCampaignPerformanceDraftId] = useState('')
  const [campaignPerformanceLoadingId, setCampaignPerformanceLoadingId] = useState('')
  const [campaignPerformanceError, setCampaignPerformanceError] = useState(false)
  const [campaignLeadPerformanceLoading, setCampaignLeadPerformanceLoading] = useState(false)
  const [campaignLeadPerformanceError, setCampaignLeadPerformanceError] = useState(false)
  const [campaignDeliveryReview, setCampaignDeliveryReview] = useState<Awaited<ReturnType<typeof campaignsApi.campaigns.listDeliveryReview>> | null>(null)
  const [campaignReviewLoading, setCampaignReviewLoading] = useState(false)
  const [campaignReviewError, setCampaignReviewError] = useState('')
  const [campaignReviewSavingId, setCampaignReviewSavingId] = useState('')
  const [campaignDeliveryToRetry, setCampaignDeliveryToRetry] = useState('')
  const [campaignReviewOffset, setCampaignReviewOffset] = useState(0)
  const [campaignPendingReplies, setCampaignPendingReplies] = useState<Awaited<ReturnType<typeof campaignsApi.campaigns.pendingReplies>> | null>(null)
  const [campaignPendingRepliesLoading, setCampaignPendingRepliesLoading] = useState(false)
  const [campaignPendingRepliesError, setCampaignPendingRepliesError] = useState(false)
  const [campaignPendingRepliesOffset, setCampaignPendingRepliesOffset] = useState(0)
  const [campaignChannels, setCampaignChannels] = useState<SdrPreviewChannelDto[]>([])
  const [campaignDraftsLoading, setCampaignDraftsLoading] = useState(false)
  const [campaignDraftSaving, setCampaignDraftSaving] = useState(false)
  const [campaignStartingId, setCampaignStartingId] = useState('')
  const [campaignStartedCount, setCampaignStartedCount] = useState<number | null>(null)
  const [campaignDraftError, setCampaignDraftError] = useState('')
  const [campaignDraftForm, setCampaignDraftForm] = useState<CreateCampaignDraftInput>({ name: '', openingMessage: '', channelId: '', channelIds: [], windowStart: '09:00', windowEnd: '17:00', timeZone: CAMPAIGN_TIME_ZONE_DEFAULT, dailyMessageLimit: 50, minimumDelaySeconds: 30 })
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
    try { setSdrPreview(await api.leads.sdrPreview({ channelId: channelId || undefined, businessLineId: businessLineFilter || undefined, limit: SDR_PREVIEW_PAGE_SIZE, offset })) }
    catch { setSdrPreviewError(true) }
    finally { setSdrPreviewLoading(false) }
  }
  const openSdrPreview = async () => {
    setSdrPreviewOpen(true); setSdrPreview(null); setSdrPreviewError(false); setSdrPreviewLoading(true)
    try {
      const channels = await api.leads.sdrPreviewChannels()
      const visibleChannels = businessLineFilter ? channels.filter((channel) => channel.businessLineId === businessLineFilter) : channels
      const defaultChannelId = visibleChannels.find((channel) => channel.isActive && channel.isConfigured)?.id ?? ''
      setSdrPreviewChannels(visibleChannels); setSdrPreviewChannelId(defaultChannelId)
      setSdrPreview(await api.leads.sdrPreview({ channelId: defaultChannelId || undefined, businessLineId: businessLineFilter || undefined, limit: SDR_PREVIEW_PAGE_SIZE, offset: 0 }))
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
      setCampaignDraftForm((current) => current.channelIds.length ? current : { ...current, channelId: firstConfigured?.id ?? '', channelIds: firstConfigured ? [firstConfigured.id] : [] })
    } catch { setCampaignDraftError(t('campaignDrafts.loadFailed')) }
    finally { setCampaignDraftsLoading(false) }
  }
  const createCampaignDraft = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setCampaignDraftSaving(true); setCampaignDraftError('')
    try {
      await api.campaigns.createDraft({ ...campaignDraftForm, channelId: campaignDraftForm.channelIds[0] ?? '', channelIds: campaignDraftForm.channelIds })
      setCampaignDraftForm((current) => ({ ...current, name: '' }))
      await loadCampaignDrafts(0)
    } catch (error) { setCampaignDraftError(error instanceof ApiError && error.code === 'CAMPAIGN_CHANNELS_MUST_SHARE_BUSINESS_LINE' ? t('campaignDrafts.crossLineChannels') : t('campaignDrafts.saveFailed')) }
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

  const loadCampaignPerformance = async (campaignDraftId: string) => {
    setCampaignPerformanceDraftId(campaignDraftId); setCampaignPerformanceLoadingId(campaignDraftId); setCampaignPerformanceError(false); setCampaignLeadPerformance(null); setCampaignLeadPerformanceError(false)
    void loadCampaignPerformanceLeads(campaignDraftId, 0)
    try { setCampaignPerformance(await campaignsApi.campaigns.performance(campaignDraftId)) }
    catch { setCampaignPerformance(null); setCampaignPerformanceError(true) }
    finally { setCampaignPerformanceLoadingId('') }
  }

  const loadCampaignPerformanceLeads = async (campaignDraftId: string, offset: number) => {
    setCampaignLeadPerformanceLoading(true); setCampaignLeadPerformanceError(false)
    try { setCampaignLeadPerformance(await campaignsApi.campaigns.performanceLeads(campaignDraftId, { limit: 25, offset })) }
    catch { setCampaignLeadPerformance(null); setCampaignLeadPerformanceError(true) }
    finally { setCampaignLeadPerformanceLoading(false) }
  }

  const loadCampaignDeliveryReview = async (offset = 0) => {
    setCampaignReviewOffset(offset)
    setCampaignReviewError('')
    setCampaignReviewLoading(true)
    try { setCampaignDeliveryReview(await campaignsApi.campaigns.listDeliveryReview({ limit: 25, offset })) }
    catch { setCampaignReviewError(t('campaignDrafts.reviewLoadFailed')) }
    finally { setCampaignReviewLoading(false) }
  }

  const loadCampaignPendingReplies = async (offset = 0) => {
    setCampaignPendingRepliesOffset(offset); setCampaignPendingRepliesLoading(true); setCampaignPendingRepliesError(false)
    try { setCampaignPendingReplies(await campaignsApi.campaigns.pendingReplies({ limit: CAMPAIGN_QUEUE_PAGE_SIZE, offset })) }
    catch { setCampaignPendingReplies(null); setCampaignPendingRepliesError(true) }
    finally { setCampaignPendingRepliesLoading(false) }
  }

  const confirmCampaignDelivery = async (outboxEventId: string) => {
    setCampaignReviewSavingId(outboxEventId)
    try {
      await campaignsApi.campaigns.confirmDeliverySent(outboxEventId)
      await loadCampaignDeliveryReview(campaignReviewOffset)
    } catch { setCampaignReviewError(t('campaignDrafts.reviewConfirmFailed')) }
    finally { setCampaignReviewSavingId('') }
  }

  const retryCampaignDelivery = async () => {
    const outboxEventId = campaignDeliveryToRetry
    if (!outboxEventId) return
    setCampaignDeliveryToRetry('')
    setCampaignReviewSavingId(outboxEventId)
    try {
      await campaignsApi.campaigns.confirmDeliveryNotSent(outboxEventId)
      await loadCampaignDeliveryReview(campaignReviewOffset)
    } catch { setCampaignReviewError(t('campaignDrafts.retryNotSentFailed')) }
    finally { setCampaignReviewSavingId('') }
  }

  const selectCampaignTab = (tab: CampaignTab) => {
    setCampaignTab(tab)
    window.sessionStorage.setItem('30sales-campaign-workspace-tab', tab)
    if (tab === CAMPAIGN_WORKSPACE_TAB.deliveryReview && !campaignDeliveryReview && !campaignReviewLoading) void loadCampaignDeliveryReview()
    if (tab === CAMPAIGN_WORKSPACE_TAB.pendingReplies && !campaignPendingReplies && !campaignPendingRepliesLoading) void loadCampaignPendingReplies()
  }

  const handleCampaignTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const tabs = CAMPAIGN_WORKSPACE_TABS
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
    api.leads.listPage({ businessLineId: businessLineFilter || undefined, status: statusFilter || undefined, source: sourceFilter || undefined, assignedToUserId: assigneeFilter || undefined, segmentId: segmentFilter || undefined, marketSegment: ACCOUNT_MARKET_SEGMENTS.find((segment) => segment === marketFilter), withoutMarketSegment: marketFilter === ACCOUNT_MARKET_FILTER.unclassified || undefined, studentCountMin: studentCountMin ?? undefined, studentCountMax: studentCountMax ?? undefined, search: search || undefined, sortBy, sortDirection, limit: pageSize, offset })
      .then((result) => { if (active) { setLeads(result.data); setTotal(result.pagination.total); setHasNextPage(result.pagination.hasNextPage) } })
      .catch(() => { if (active) setError(t('errors.loadLeads')) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [businessLineFilter, statusFilter, sourceFilter, assigneeFilter, segmentFilter, marketFilter, studentCountMin, studentCountMax, studentRangeInvalid, search, sortBy, sortDirection, pageSize, offset, refreshVersion, t])

  useEffect(() => { api.leads.assignees().then(setAssignees).catch(() => setAssignees(null)) }, [])
  useEffect(() => { api.accounts.segments().then(setSegments).catch(() => setSegments([])) }, [])
  useEffect(() => {
    let active = true
    api.businessLines.list().then((result) => {
      if (!active) return
      const lines = result.data.filter((line) => line.status === 'active')
      setBusinessLines(lines)
      setForm((current) => ({ ...current, businessLineId: lines.some((line) => line.id === globalBusinessLineId) ? globalBusinessLineId : lines.some((line) => line.id === current.businessLineId) ? current.businessLineId : lines.find((line) => line.isDefault)?.id ?? lines[0]?.id ?? '' }))
    }).catch(() => { if (active) setBusinessLines([]) })
    return () => { active = false }
  }, [globalBusinessLineId])

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
      setForm({ businessLineId: form.businessLineId, accountName: '', contactName: '', email: '', phone: '', source: 'manual' })
      setDuplicateCandidates(null)
      setDuplicateOverrideReason('')
      setShowForm(false)
      setOffset(0)
      setRefreshVersion((version) => version + 1)
      notifySystemAlert(SYSTEM_ALERT_KIND.success, t('leads.createSucceeded'))
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'LEAD_POSSIBLE_DUPLICATES') {
        try { const result = await api.leads.checkDuplicates(form); if (result.candidates.length) { setDuplicateCandidates(result.candidates); setError('') } else notifySystemAlert(SYSTEM_ALERT_KIND.error, t('errors.saveLead')) }
        catch { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('leadDuplicateReview.checkFailed')) }
      } else notifySystemAlert(SYSTEM_ALERT_KIND.error, t('errors.saveLead'))
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
    } catch { notifySystemAlert(SYSTEM_ALERT_KIND.error, t('leadDuplicateReview.checkFailed')) }
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
    const requestId = contactsRequestId.current + 1
    contactsRequestId.current = requestId
    setContactsLead(lead)
    setLeadContacts([])
    setContactsError('')
    setQualificationFacts(null)
    setQualificationFactsError('')
    setQualificationSuggestions([])
    setQualificationSuggestionsGenerated(false)
    setQualificationSuggestionsError('')
    setQualificationFactsOffset(LEAD_QUALIFICATION_FACT_LIMITS.offsetStart)
    setQualificationFactForm(defaultQualificationFactForm)
    setAccountContacts(null)
    setAccountContactsError('')
    setAccountContactsOffset(LEAD_ACCOUNT_CONTACT_LIMITS.offsetStart)
    setContactsLoading(true)
    setQualificationFactsLoading(true)
    setAccountContactsLoading(true)
    const [contactsResult, factsResult, accountContactsResult] = await Promise.allSettled([
      api.leads.contacts(lead.id),
      api.leads.qualificationFacts(lead.id, { limit: LEAD_QUALIFICATION_FACT_LIMITS.pageSize, offset: LEAD_QUALIFICATION_FACT_LIMITS.offsetStart }),
      api.leads.accountContacts(lead.id, { limit: LEAD_ACCOUNT_CONTACT_LIMITS.pageSize, offset: LEAD_ACCOUNT_CONTACT_LIMITS.offsetStart }),
    ])
    if (contactsRequestId.current !== requestId) return
    if (contactsResult.status === ASYNC_RESULT_STATUS.fulfilled) setLeadContacts(contactsResult.value)
    else setContactsError(t('leadContacts.loadFailed'))
    if (factsResult.status === ASYNC_RESULT_STATUS.fulfilled) setQualificationFacts(factsResult.value)
    else setQualificationFactsError(t('leadQualification.loadFailed'))
    if (accountContactsResult.status === ASYNC_RESULT_STATUS.fulfilled) setAccountContacts(accountContactsResult.value)
    else setAccountContactsError(t('leadContacts.accountContactsLoadFailed'))
    setContactsLoading(false)
    setQualificationFactsLoading(false)
    setAccountContactsLoading(false)
  }
  const loadAccountContacts = async (leadId: string, nextOffset: number) => {
    setAccountContactsLoading(true)
    setAccountContactsError('')
    try {
      setAccountContacts(await api.leads.accountContacts(leadId, { limit: LEAD_ACCOUNT_CONTACT_LIMITS.pageSize, offset: nextOffset }))
      setAccountContactsOffset(nextOffset)
    } catch { setAccountContactsError(t('leadContacts.accountContactsLoadFailed')) }
    finally { setAccountContactsLoading(false) }
  }
  const linkAccountContact = async (personId: string) => {
    if (!contactsLead) return
    setLinkingAccountContactId(personId)
    setContactsError('')
    try {
      const contact = await api.leads.linkAccountContact(contactsLead.id, personId)
      setLeadContacts((current) => [...current, contact].sort((left, right) => left.isPrimary === right.isPrimary ? left.name.localeCompare(right.name, i18n.language) : left.isPrimary ? LEAD_CONTACT_PRIMARY_SORT_ORDER.primaryFirst : LEAD_CONTACT_PRIMARY_SORT_ORDER.secondaryFirst))
      await loadAccountContacts(contactsLead.id, LEAD_ACCOUNT_CONTACT_LIMITS.offsetStart)
    } catch (caught) {
      setContactsError(caught instanceof ApiError && caught.code === LEAD_CONTACT_ERROR_CODE.unavailable ? t('leadContacts.accountContactUnavailable') : caught instanceof ApiError && caught.code === LEAD_CONTACT_ERROR_CODE.alreadyLinked ? t('leadContacts.accountContactAlreadyLinked') : t('leadContacts.accountContactLinkFailed'))
    } finally { setLinkingAccountContactId('') }
  }
  const loadQualificationFacts = async (leadId: string, nextOffset: number) => {
    setQualificationFactsLoading(true)
    setQualificationFactsError('')
    try {
      setQualificationFacts(await api.leads.qualificationFacts(leadId, { limit: LEAD_QUALIFICATION_FACT_LIMITS.pageSize, offset: nextOffset }))
      setQualificationFactsOffset(nextOffset)
    } catch { setQualificationFactsError(t('leadQualification.loadFailed')) }
    finally { setQualificationFactsLoading(false) }
  }
  const generateQualificationSuggestions = async () => {
    if (!contactsLead) return
    setQualificationSuggestionsLoading(true)
    setQualificationSuggestionsError('')
    setQualificationSuggestions([])
    try {
      setQualificationSuggestions(await api.leads.suggestQualificationFacts(contactsLead.id))
      setQualificationSuggestionsGenerated(true)
    }
    catch (error) {
      setQualificationSuggestionsError(error instanceof ApiError && error.code === LEAD_QUALIFICATION_SUGGESTION_ERROR_CODE.noConversation
        ? t('leadQualification.noConversation')
        : error instanceof ApiError && error.code === LEAD_QUALIFICATION_SUGGESTION_ERROR_CODE.assistantUnavailable
          ? t('leadQualification.assistantUnavailable')
          : t('leadQualification.suggestionsFailed'))
    } finally { setQualificationSuggestionsLoading(false) }
  }
  const acceptQualificationSuggestion = async (suggestion: QualificationSuggestionDto) => {
    if (!contactsLead) return
    const key = qualificationSuggestionKey(suggestion)
    setSavingQualificationSuggestionKey(key)
    setQualificationFactsError('')
    try {
      await api.leads.addQualificationFact(contactsLead.id, { factKey: suggestion.factKey, value: suggestion.value, state: suggestion.state, source: LEAD_QUALIFICATION_FACT_SOURCE.conversation, evidence: suggestion.evidence, sourceMessageId: suggestion.sourceMessageId, confidence: suggestion.confidence })
      setQualificationSuggestions((current) => current.filter((item) => qualificationSuggestionKey(item) !== key))
      await loadQualificationFacts(contactsLead.id, LEAD_QUALIFICATION_FACT_LIMITS.offsetStart)
    } catch { setQualificationFactsError(t('leadQualification.saveFailed')) }
    finally { setSavingQualificationSuggestionKey('') }
  }
  const saveQualificationFact = async (event: FormEvent) => {
    event.preventDefault()
    if (!contactsLead) return
    setQualificationFactsSaving(true)
    setQualificationFactsError('')
    const valueIsNotApplicable = qualificationFactForm.state === LEAD_QUALIFICATION_FACT_STATE.unknown || qualificationFactForm.state === LEAD_QUALIFICATION_FACT_STATE.notApplicable
    const payload: CreateQualificationFactInput = { ...qualificationFactForm, value: valueIsNotApplicable ? null : qualificationFactForm.value?.trim() ?? '', evidence: qualificationFactForm.evidence?.trim() || null }
    try {
      await api.leads.addQualificationFact(contactsLead.id, payload)
      setQualificationFactForm(defaultQualificationFactForm)
      await loadQualificationFacts(contactsLead.id, LEAD_QUALIFICATION_FACT_LIMITS.offsetStart)
    } catch { setQualificationFactsError(t('leadQualification.saveFailed')) }
    finally { setQualificationFactsSaving(false) }
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
      setContactsError(caught instanceof ApiError && caught.code === LEAD_CONTACT_ERROR_CODE.duplicate ? t('leadContacts.duplicate') : caught instanceof ApiError && caught.code === LEAD_CONTACT_ERROR_CODE.ambiguousAccountMatch ? t('leadContacts.ambiguousAccountMatch') : t('leadContacts.saveFailed'))
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
    <label className="lead-filter-label">{t('businessLines.title')}<SelectField value={businessLineFilter} onChange={(event) => { const nextLineId = event.target.value; setBusinessLineFilter(nextLineId); setOffset(0); setSearchParams((current) => { const next = new URLSearchParams(current); if (nextLineId) next.set('businessLineId', nextLineId); else next.delete('businessLineId'); return next }) }}><option value="">{t('businessLines.allLines')}</option>{businessLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</SelectField></label>
    <label className="lead-filter-label">{t('common.status')}<SelectField value={statusFilter} onChange={(event) => { const value = parseLeadStatus(event.target.value); setStatusFilter(value ?? ''); setOffset(0) }}><option value="">{t('leads.allStatuses')}</option>{statusOrder.map((status) => <option key={status} value={status}>{t(`leadStatuses.${status}`)}</option>)}</SelectField></label>
    <label className="lead-filter-label">{t('leads.source')}<SelectField value={sourceFilter} onChange={(event) => { setSourceFilter(sourceOrder.find((source) => source === event.target.value) ?? ''); setOffset(0) }}><option value="">{t('leads.allSources')}</option>{sourceOrder.map((source) => <option key={source} value={source}>{t(`leads.sources.${source}`)}</option>)}</SelectField></label>
    <label className="lead-filter-label">{t('accounts.columns.segment')}<SelectField value={segmentFilter} onChange={(event) => { setSegmentFilter(event.target.value); setOffset(0) }}><option value="">{t('accounts.allSegments')}</option><option value={ACCOUNT_SEGMENT_FILTER.unassigned}>{t('accounts.unsegmented')}</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</SelectField></label>
    <label className="lead-filter-label">{t('accountProfileFields.marketSegment')}<SelectField value={marketFilter} onChange={(event) => { setMarketFilter(event.target.value); setOffset(0) }}><option value={ACCOUNT_MARKET_FILTER.all}>{t('accountProfileFields.allMarketSegments')}</option><option value={ACCOUNT_MARKET_FILTER.unclassified}>{t('accountProfileFields.unclassifiedMarketSegment')}</option>{ACCOUNT_MARKET_SEGMENTS.map((segment) => <option key={segment} value={segment}>{t(`accountProfileFields.marketSegments.${segment}`)}</option>)}</SelectField></label>
    <label className="lead-filter-label">{t('accountProfileFields.minStudents')}<NumericField mode="integer" min={0} max={10000000} value={studentCountMin} onValueChange={(value) => { setStudentCountMin(value); setOffset(0) }} /></label>
    <label className="lead-filter-label">{t('accountProfileFields.maxStudents')}<NumericField mode="integer" min={0} max={10000000} value={studentCountMax} onValueChange={(value) => { setStudentCountMax(value); setOffset(0) }} /></label>
    {studentRangeInvalid && <small className="lead-filter-error" role="alert">{t('accountProfileFields.invalidStudentRange')}</small>}
    {assignees && <label className="lead-filter-label">{t('leadAssignment.assignee')}<SelectField value={assigneeFilter} onChange={(event) => { setAssigneeFilter(event.target.value); setOffset(0) }}><option value="">{t('leadAssignment.allAssignees')}</option><option value="unassigned">{t('leadAssignment.unassigned')}</option>{assignees.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</SelectField></label>}
  </>

  const emptyState = error ? <div><strong>{error}</strong></div> : search || businessLineFilter || statusFilter || sourceFilter || assigneeFilter || segmentFilter || marketFilter !== ACCOUNT_MARKET_FILTER.all || studentCountMin !== null || studentCountMax !== null ? <div><strong>{t('leads.noSearchResults')}</strong><p>{t('leads.noSearchHint')}</p><Button className="text-button" onClick={() => { setQuery(''); setSearch(''); setBusinessLineFilter(''); setStatusFilter(''); setSourceFilter(''); setAssigneeFilter(''); setSegmentFilter(''); setMarketFilter(ACCOUNT_MARKET_FILTER.all); setStudentCountMin(null); setStudentCountMax(null); setOffset(0); setSearchParams((current) => { const next = new URLSearchParams(current); next.delete('businessLineId'); return next }) }}>{t('leads.clearFilters')}</Button></div> : <div><strong>{t('leads.emptyTitle')}</strong><p>{t('leads.emptyHint')}</p><Button className="text-button" onClick={() => setShowForm(true)}>{t('leads.addFirstLead')}</Button></div>

  return <section className="leads-page">
    <header className="leads-heading"><div><p className="eyebrow">{t('leads.eyebrow')}</p><h2>{t('leads.title')}</h2><p className="muted">{t('leads.description')}</p></div>
      <div className="lead-actions"><Button type="button" className="primary add-lead" disabled={businessLines.length === 0} onClick={() => setShowForm(true)}><Plus size={16} />{t('leads.addLead')}</Button><Button type="button" onClick={() => void openCampaignDrafts()}><Megaphone size={16} />{t('campaignDrafts.open')}</Button><Button type="button" onClick={openSdrPreview}><Bot size={16} />{t('sdrPreview.open')}</Button><Button type="button" className="refresh" onClick={() => setRefreshVersion((version) => version + 1)} aria-label={t('leads.refresh')}><RefreshCw size={16} /></Button></div>
    </header>
    <Modal open={campaignDraftsOpen} onOpenChange={(open) => { setCampaignDraftsOpen(open); if (!open) { setCampaignDraftError(''); setCampaignDrafts(null); setCampaignChannels([]) } }} title={t('campaignDrafts.title')} description={t('campaignDrafts.description')} closeLabel={t('common.close')} className="campaign-drafts-modal">
      {campaignDraftError && <WorkspaceState kind="error" compact message={campaignDraftError}><Button type="button" onClick={() => void loadCampaignDrafts(campaignDrafts?.pagination.offset ?? 0)}>{t('sdrPreview.retry')}</Button></WorkspaceState>}
      {campaignDraftsLoading && !campaignDrafts ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : <>
      <div className="campaign-workspace-tabs" role="tablist" aria-label={t('campaignDrafts.sections')}>
        <Button type="button" role="tab" id={`campaign-tab-${CAMPAIGN_WORKSPACE_TAB.campaigns}`} aria-controls={`campaign-panel-${CAMPAIGN_WORKSPACE_TAB.campaigns}`} aria-selected={campaignTab === CAMPAIGN_WORKSPACE_TAB.campaigns} tabIndex={campaignTab === CAMPAIGN_WORKSPACE_TAB.campaigns ? 0 : -1} className={campaignTab === CAMPAIGN_WORKSPACE_TAB.campaigns ? 'selected' : ''} onKeyDown={handleCampaignTabKeyDown} onClick={() => selectCampaignTab(CAMPAIGN_WORKSPACE_TAB.campaigns)}>{t('campaignDrafts.campaignsTab')}</Button>
        <Button type="button" role="tab" id={`campaign-tab-${CAMPAIGN_WORKSPACE_TAB.calendar}`} aria-controls={`campaign-panel-${CAMPAIGN_WORKSPACE_TAB.calendar}`} aria-selected={campaignTab === CAMPAIGN_WORKSPACE_TAB.calendar} tabIndex={campaignTab === CAMPAIGN_WORKSPACE_TAB.calendar ? 0 : -1} className={campaignTab === CAMPAIGN_WORKSPACE_TAB.calendar ? 'selected' : ''} onKeyDown={handleCampaignTabKeyDown} onClick={() => selectCampaignTab(CAMPAIGN_WORKSPACE_TAB.calendar)}>{t('campaignDrafts.calendarTab')}</Button>
        <Button type="button" role="tab" id={`campaign-tab-${CAMPAIGN_WORKSPACE_TAB.deliveryReview}`} aria-controls={`campaign-panel-${CAMPAIGN_WORKSPACE_TAB.deliveryReview}`} aria-selected={campaignTab === CAMPAIGN_WORKSPACE_TAB.deliveryReview} tabIndex={campaignTab === CAMPAIGN_WORKSPACE_TAB.deliveryReview ? 0 : -1} className={campaignTab === CAMPAIGN_WORKSPACE_TAB.deliveryReview ? 'selected' : ''} onKeyDown={handleCampaignTabKeyDown} onClick={() => selectCampaignTab(CAMPAIGN_WORKSPACE_TAB.deliveryReview)}>{t('campaignDrafts.deliveryReview')}</Button>
        <Button type="button" role="tab" id={`campaign-tab-${CAMPAIGN_WORKSPACE_TAB.pendingReplies}`} aria-controls={`campaign-panel-${CAMPAIGN_WORKSPACE_TAB.pendingReplies}`} aria-selected={campaignTab === CAMPAIGN_WORKSPACE_TAB.pendingReplies} tabIndex={campaignTab === CAMPAIGN_WORKSPACE_TAB.pendingReplies ? 0 : -1} className={campaignTab === CAMPAIGN_WORKSPACE_TAB.pendingReplies ? 'selected' : ''} onKeyDown={handleCampaignTabKeyDown} onClick={() => selectCampaignTab(CAMPAIGN_WORKSPACE_TAB.pendingReplies)}>{t('campaignPendingReplies.title')}</Button>
      </div>
      <div role="tabpanel" id={`campaign-panel-${CAMPAIGN_WORKSPACE_TAB.campaigns}`} aria-labelledby={`campaign-tab-${CAMPAIGN_WORKSPACE_TAB.campaigns}`} hidden={campaignTab !== CAMPAIGN_WORKSPACE_TAB.campaigns}>
        <form className="campaign-draft-form" onSubmit={(event) => void createCampaignDraft(event)}>
          <div className="campaign-draft-form-heading"><strong>{t('campaignDrafts.newDraft')}</strong><p>{t('campaignDrafts.formHint')}</p></div>
          <label>{t('campaignDrafts.name')}<TextField value={campaignDraftForm.name} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={120} required /></label>
          <fieldset className="campaign-channel-options"><legend>{t('campaignDrafts.channels')}</legend><p className="form-hint">{t('campaignDrafts.channelsHint')}</p>{campaignChannels.map((channel) => { const selectedLineId = campaignChannels.find((candidate) => candidate.id === campaignDraftForm.channelIds[0])?.businessLineId; const belongsToAnotherLine = campaignDraftForm.channelIds.length > 0 && selectedLineId !== channel.businessLineId; return <label key={channel.id}><CheckboxField checked={campaignDraftForm.channelIds.includes(channel.id)} disabled={!channel.isActive || !channel.isConfigured || belongsToAnotherLine} onChange={(event) => setCampaignDraftForm((current) => { const nextIds = event.target.checked ? [...current.channelIds, channel.id] : current.channelIds.filter((id) => id !== channel.id); return { ...current, channelIds: nextIds, channelId: nextIds[0] ?? '' } })} /><span>{channel.displayName} · {channel.phoneNumber}{channel.businessLineName ? ` · ${t('campaignDrafts.channelBusinessLine', { name: channel.businessLineName })}` : ''}{!channel.isActive ? ` · ${t('sdrPreview.channelInactive')}` : !channel.isConfigured ? ` · ${t('sdrPreview.channelUnconfigured')}` : ''}</span></label> })}</fieldset>
          {campaignChannels.length === 0 && <p className="form-hint">{t('sdrPreview.noChannels')}</p>}
          <label>{t('campaignDrafts.openingMessage')}<TextareaField value={campaignDraftForm.openingMessage} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, openingMessage: event.target.value }))} minLength={1} maxLength={4096} rows={4} required /></label>
          <div className="campaign-draft-fields">
            <label>{t('campaignDrafts.windowStart')}<TextField type="time" value={campaignDraftForm.windowStart} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, windowStart: event.target.value }))} required /></label>
            <label>{t('campaignDrafts.windowEnd')}<TextField type="time" value={campaignDraftForm.windowEnd} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, windowEnd: event.target.value }))} required /></label>
            <label>{t('campaignDrafts.dailyLimit')}<NumericField mode="integer" min={1} max={500} value={campaignDraftForm.dailyMessageLimit} onValueChange={(value) => setCampaignDraftForm((current) => ({ ...current, dailyMessageLimit: value ?? 0 }))} required /></label>
            <label>{t('campaignDrafts.minimumDelay')}<NumericField mode="integer" min={5} max={300} value={campaignDraftForm.minimumDelaySeconds} onValueChange={(value) => setCampaignDraftForm((current) => ({ ...current, minimumDelaySeconds: value ?? 0 }))} required /></label>
          </div>
          <label>{t('campaignDrafts.timeZone')}<TextField value={campaignDraftForm.timeZone} onChange={(event) => setCampaignDraftForm((current) => ({ ...current, timeZone: event.target.value }))} maxLength={80} required /></label>
          <Button type="submit" variant="primary" disabled={campaignDraftSaving || campaignDraftForm.channelIds.length === 0}>{campaignDraftSaving ? t('common.saving') : t('campaignDrafts.saveDraft')}</Button>
          <p className="form-hint">{t('campaignDrafts.draftOnly')}</p>
        </form>
        <section className="campaign-draft-list" aria-label={t('campaignDrafts.savedDrafts')}>
          <div className="campaign-draft-list-heading"><div><strong>{t('campaignDrafts.savedDrafts')}</strong><span>{t('campaignDrafts.count', { count: campaignDrafts?.pagination.total ?? 0 })}</span></div></div>
          <p className="form-hint">{t('campaignDrafts.pauseHint')}</p>
          {campaignStartedCount !== null && <p className="success-message" role="status">{t('campaignDrafts.started', { count: campaignStartedCount })}</p>}
          {!campaignDraftsLoading && campaignDrafts?.data.length === 0 ? <WorkspaceState kind="empty" message={t('campaignDrafts.empty')} /> : <ul>{campaignDrafts?.data.map((draft) => <li key={draft.id}>
            <div><strong>{draft.name}</strong><span>{draft.channelLabels.join(', ')}</span><small>{t('campaignDrafts.schedule', { start: draft.windowStart, end: draft.windowEnd, timeZone: draft.timeZone })}</small></div>
            <div><span>{t('campaignDrafts.dailyLimitValue', { count: draft.dailyMessageLimit })}</span><span>{t('campaignDrafts.delayValue', { count: draft.minimumDelaySeconds })}</span><span>{t('campaignAudience.savedCount', { count: draft.audienceLeadCount })}</span><b>{t(`campaignDrafts.status.${draft.status}`)}</b>
              <Button type="button" onClick={() => setCampaignReadinessDraft(draft)}>{t('campaignDrafts.checkReadiness')}</Button>
              {draft.status !== CAMPAIGN_DRAFT_STATUS.draft && <Button type="button" onClick={() => { if (campaignPerformanceDraftId === draft.id) { setCampaignPerformance(null); setCampaignLeadPerformance(null); setCampaignPerformanceDraftId('') } else void loadCampaignPerformance(draft.id) }}>{campaignPerformanceLoadingId === draft.id ? t('common.loading') : t('campaignPerformanceReport.performance')}</Button>}
              <Button type="button" onClick={() => setCampaignAudienceDraft(draft)} disabled={draft.status !== CAMPAIGN_DRAFT_STATUS.draft}>{t('campaignAudience.select')}</Button>
              {draft.status === CAMPAIGN_DRAFT_STATUS.active && <Button type="button" disabled={campaignStartingId !== ''} onClick={() => void changeCampaignStatus(draft, 'pause')}>{campaignStartingId === draft.id ? t('common.saving') : t('campaignDrafts.pause')}</Button>}
              {draft.status === CAMPAIGN_DRAFT_STATUS.paused && <Button type="button" variant="primary" disabled={campaignStartingId !== ''} onClick={() => void changeCampaignStatus(draft, 'resume')}>{campaignStartingId === draft.id ? t('common.saving') : t('campaignDrafts.resume')}</Button>}
              {draft.status === CAMPAIGN_DRAFT_STATUS.draft && <Button type="button" variant="primary" disabled={draft.audienceLeadCount === 0 || campaignStartingId !== ''} onClick={() => void startCampaign(draft)}>{campaignStartingId === draft.id ? t('common.saving') : t('campaignDrafts.start')}</Button>}
            </div>
            {campaignPerformanceDraftId === draft.id && <div className="campaign-performance" role="region" aria-label={t('campaignPerformanceReport.performance')}>
              {campaignPerformanceLoadingId === draft.id ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : campaignPerformanceError ? <WorkspaceState kind="error" compact message={t('campaignPerformanceReport.performanceFailed')}><Button type="button" onClick={() => void loadCampaignPerformance(draft.id)}>{t('campaignPerformanceReport.retry')}</Button></WorkspaceState> : campaignPerformance && <>
                <header className="campaign-performance-heading"><strong>{t('campaignPerformanceReport.performanceTotal', { count: formatCampaignCount(campaignPerformance.total) })}</strong><p>{t('campaignPerformanceReport.attributionHint')}</p></header>
                <div className="campaign-performance-channels">{campaignPerformance.channels.map((channel) => <section className="campaign-channel-results" key={channel.channelId} aria-label={channel.channelLabel}>
                  <h4>{channel.channelLabel}</h4>
                  <dl className="campaign-metric-grid">
                    <div><dt>{t('campaignPerformanceReport.queuedLabel')}</dt><dd>{formatCampaignCount(channel.queued)}</dd></div>
                    <div><dt>{t('campaignPerformanceReport.processingLabel')}</dt><dd>{formatCampaignCount(channel.processing)}</dd></div>
                    <div><dt>{t('campaignPerformanceReport.sentLabel')}</dt><dd>{formatCampaignCount(channel.sent)}</dd></div>
                    <div><dt>{t('campaignPerformanceReport.deliveredLabel')}</dt><dd>{formatCampaignCount(channel.delivered)}</dd></div>
                    <div className="campaign-metric-outcome"><dt>{t('campaignPerformanceReport.respondedLabel')}</dt><dd>{formatCampaignCount(channel.replied)}</dd></div>
                    <div className="campaign-metric-outcome"><dt>{t('campaignPerformanceReport.meetingsLabel')}</dt><dd>{formatCampaignCount(channel.meetings)}</dd></div>
                    <div className="campaign-metric-outcome"><dt>{t('campaignPerformanceReport.opportunitiesCreatedLabel')}</dt><dd>{formatCampaignCount(channel.opportunitiesCreated)}</dd></div>
                    <div className="campaign-metric-outcome"><dt>{t('campaignPerformanceReport.wonCountLabel')}</dt><dd>{formatCampaignCount(channel.won)}</dd></div>
                    <div><dt>{t('campaignPerformanceReport.reviewLabel')}</dt><dd>{formatCampaignCount(channel.needsReview)}</dd></div>
                  </dl>
                </section>)}</div>
                <section className="campaign-performance-leads" aria-label={t('campaignPerformanceReport.leadAssignments')}>
                  <h4>{t('campaignPerformanceReport.leadAssignments')}</h4>
                  {campaignLeadPerformanceLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : campaignLeadPerformanceError ? <WorkspaceState kind="error" compact message={t('campaignPerformanceReport.leadsFailed')}><Button type="button" onClick={() => void loadCampaignPerformanceLeads(draft.id, 0)}>{t('campaignPerformanceReport.retry')}</Button></WorkspaceState> : campaignLeadPerformance && (campaignLeadPerformance.data.length === 0 ? <WorkspaceState kind="empty" compact message={t('campaignPerformanceReport.leadsEmpty')} /> : <>
                    <ul>{campaignLeadPerformance.data.map((item) => <li key={item.leadId}>
                      <div className="campaign-lead-identity"><strong>{item.accountName}</strong><span>{item.contactName ?? t('campaignPerformanceReport.unknownContact')}{item.phone ? ` · ${item.phone}` : ''}</span>{item.opportunityStage && <small>{t('campaignPerformanceReport.currentOpportunity', { stage: item.opportunityStage === 'custom' ? item.opportunityStageLabel ?? t('opportunityStages.custom') : t(`opportunityStages.${item.opportunityStage}`) })}</small>}{item.opportunityStage && !item.opportunityCreatedAfterCampaign && <small className="campaign-preexisting-opportunity">{t('campaignPerformanceReport.preexistingOpportunity')}</small>}</div>
                      <div className="campaign-lead-outcomes"><span className="campaign-lead-delivery">{item.inProgress ? t('campaignPerformanceReport.outbox.processing') : t(`campaignPerformanceReport.outbox.${item.outboxStatus}`)}<small>{item.deliveryState ? t(`campaignPerformanceReport.delivery.${item.deliveryState}`) : t('campaignPerformanceReport.noMessage')}</small></span><div className="campaign-outcome-badges">{item.replied && <span>{t('campaignPerformanceReport.repliedLabel')}</span>}{item.meetingAfterCampaign && <span>{t('campaignPerformanceReport.meetingLabel')}</span>}{item.opportunityCreatedAfterCampaign && <span>{t('campaignPerformanceReport.opportunityCreatedLabel')}</span>}{item.wonAfterCampaign && <span className="is-won">{t('campaignPerformanceReport.wonLabel')}</span>}</div>{item.replied && item.conversationId && <Button type="button" onClick={() => item.conversationId && onOpenInbox(item.conversationId)}>{t('campaignPerformanceReport.openConversation')}</Button>}</div>
                    </li>)}</ul>
                    <div className="campaign-performance-pagination"><Button type="button" aria-label={t('table.previous')} disabled={campaignLeadPerformanceLoading || campaignLeadPerformance.pagination.offset === PAGINATION_OFFSET_START} onClick={() => void loadCampaignPerformanceLeads(draft.id, Math.max(PAGINATION_OFFSET_START, campaignLeadPerformance.pagination.offset - campaignLeadPerformance.pagination.limit))}><ChevronLeft size={16} aria-hidden="true" /></Button><span>{t('table.page', { page: Math.floor(campaignLeadPerformance.pagination.offset / campaignLeadPerformance.pagination.limit) + 1, pages: Math.max(PAGINATION_MINIMUM_PAGE_COUNT, Math.ceil(campaignLeadPerformance.pagination.total / campaignLeadPerformance.pagination.limit)) })}</span><Button type="button" aria-label={t('table.next')} disabled={campaignLeadPerformanceLoading || !campaignLeadPerformance.pagination.hasNextPage} onClick={() => void loadCampaignPerformanceLeads(draft.id, campaignLeadPerformance.pagination.offset + campaignLeadPerformance.pagination.limit)}><ChevronRight size={16} aria-hidden="true" /></Button></div>
                  </>)}
                </section>
              </>}
            </div>}
          </li>)}</ul>}
          {campaignDrafts && <div className="sdr-preview-pagination"><Button type="button" aria-label={t('table.previous')} disabled={campaignDrafts.pagination.offset === PAGINATION_OFFSET_START || campaignDraftsLoading} onClick={() => void loadCampaignDrafts(Math.max(PAGINATION_OFFSET_START, campaignDrafts.pagination.offset - campaignDrafts.pagination.limit))}><ChevronLeft size={16} aria-hidden="true" /></Button><span>{t('table.page', { page: Math.floor(campaignDrafts.pagination.offset / campaignDrafts.pagination.limit) + 1, pages: Math.max(PAGINATION_MINIMUM_PAGE_COUNT, Math.ceil(campaignDrafts.pagination.total / campaignDrafts.pagination.limit)) })}</span><Button type="button" aria-label={t('table.next')} disabled={!campaignDrafts.pagination.hasNextPage || campaignDraftsLoading} onClick={() => void loadCampaignDrafts(campaignDrafts.pagination.offset + campaignDrafts.pagination.limit)}><ChevronRight size={16} aria-hidden="true" /></Button></div>}
        </section>
      </div>
      <div role="tabpanel" id={`campaign-panel-${CAMPAIGN_WORKSPACE_TAB.calendar}`} aria-labelledby={`campaign-tab-${CAMPAIGN_WORKSPACE_TAB.calendar}`} hidden={campaignTab !== CAMPAIGN_WORKSPACE_TAB.calendar}><CampaignHolidayCalendar /></div>
      <div role="tabpanel" id={`campaign-panel-${CAMPAIGN_WORKSPACE_TAB.pendingReplies}`} aria-labelledby={`campaign-tab-${CAMPAIGN_WORKSPACE_TAB.pendingReplies}`} hidden={campaignTab !== CAMPAIGN_WORKSPACE_TAB.pendingReplies}>
        <section className="campaign-delivery-review" aria-label={t('campaignPendingReplies.title')}>
          <div className="campaign-draft-form-heading"><strong>{t('campaignPendingReplies.title')}</strong><Button type="button" disabled={campaignPendingRepliesLoading} onClick={() => void loadCampaignPendingReplies(campaignPendingRepliesOffset)}><RefreshCw size={15} aria-hidden="true" />{t('campaignPendingReplies.refresh')}</Button></div>
          {campaignPendingRepliesError ? <WorkspaceState kind="error" compact message={t('campaignPendingReplies.loadFailed')}><Button type="button" disabled={campaignPendingRepliesLoading} onClick={() => void loadCampaignPendingReplies(campaignPendingRepliesOffset)}>{t('sdrPreview.retry')}</Button></WorkspaceState> : campaignPendingRepliesLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : !campaignPendingReplies || campaignPendingReplies.data.length === PAGINATION_OFFSET_START ? <WorkspaceState kind="empty" message={t('campaignPendingReplies.empty')} /> : <>
            <ul>{campaignPendingReplies.data.map((item) => <li key={`${item.campaignDraftId}:${item.conversationId}`}><div><strong>{item.accountName} · {item.contactName ?? t('campaignPerformanceReport.unknownContact')}</strong><span>{item.campaignName} · {item.channelLabel}</span>{item.replyPreview && <small>{item.replyPreview}</small>}<small>{t('campaignPendingReplies.owner', { name: item.ownerName ?? t('leadAssignment.unassigned') })} · {t(item.hasOpenTask ? 'campaignPendingReplies.taskExists' : 'campaignPendingReplies.noTask')} · {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.repliedAt))}</small></div><Button type="button" onClick={() => onOpenInbox(item.conversationId)}>{t('campaignPerformanceReport.openConversation')}</Button></li>)}</ul>
            <div className="sdr-preview-pagination"><Button type="button" aria-label={t('table.previous')} disabled={campaignPendingRepliesLoading || campaignPendingRepliesOffset === PAGINATION_OFFSET_START} onClick={() => void loadCampaignPendingReplies(Math.max(PAGINATION_OFFSET_START, campaignPendingRepliesOffset - CAMPAIGN_QUEUE_PAGE_SIZE))}><ChevronLeft size={16} aria-hidden="true" /></Button><span>{t('table.page', { page: Math.floor(campaignPendingRepliesOffset / CAMPAIGN_QUEUE_PAGE_SIZE) + 1, pages: Math.max(PAGINATION_MINIMUM_PAGE_COUNT, Math.ceil(campaignPendingReplies.pagination.total / CAMPAIGN_QUEUE_PAGE_SIZE)) })}</span><Button type="button" aria-label={t('table.next')} disabled={campaignPendingRepliesLoading || !campaignPendingReplies.pagination.hasNextPage} onClick={() => void loadCampaignPendingReplies(campaignPendingRepliesOffset + CAMPAIGN_QUEUE_PAGE_SIZE)}><ChevronRight size={16} aria-hidden="true" /></Button></div>
          </>}
        </section>
      </div>
      <div role="tabpanel" id={`campaign-panel-${CAMPAIGN_WORKSPACE_TAB.deliveryReview}`} aria-labelledby={`campaign-tab-${CAMPAIGN_WORKSPACE_TAB.deliveryReview}`} hidden={campaignTab !== CAMPAIGN_WORKSPACE_TAB.deliveryReview}>
        <section className="campaign-delivery-review" aria-label={t('campaignDrafts.deliveryReview')}>
          <p className="form-hint">{t('campaignDrafts.reviewSafety')}</p>
          {campaignReviewError && <WorkspaceState kind="error" compact message={campaignReviewError}><Button type="button" disabled={campaignReviewLoading} onClick={() => void loadCampaignDeliveryReview(campaignReviewOffset)}>{t('sdrPreview.retry')}</Button></WorkspaceState>}
          {!campaignReviewError && (campaignReviewLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : !campaignDeliveryReview || campaignDeliveryReview.data.length === PAGINATION_OFFSET_START ? <WorkspaceState kind="empty" message={t('campaignDrafts.reviewEmpty')} /> : <><ul>{campaignDeliveryReview.data.map((item) => <li key={item.outboxEventId}><div><strong>{item.campaignName} · {item.accountName || t('campaignDrafts.unknownLead')}</strong><span>{item.contactName ?? '—'} · {item.phone ?? '—'}</span><small>{t('campaignDrafts.reviewState', { state: item.deliveryState ?? t('campaignDrafts.noMessage'), attempts: item.attempts })}</small></div><div className="campaign-review-actions"><Button type="button" variant="primary" disabled={!item.leadId || !item.deliveryState || campaignReviewSavingId !== EMPTY_IDENTIFIER} onClick={() => void confirmCampaignDelivery(item.outboxEventId)}>{campaignReviewSavingId === item.outboxEventId ? t('common.saving') : t('campaignDrafts.confirmSent')}</Button><Button type="button" disabled={!item.leadId || CAMPAIGN_DELIVERY_REVIEW_ALREADY_SENT_STATES.includes(item.deliveryState ?? '') || campaignReviewSavingId !== EMPTY_IDENTIFIER} onClick={() => setCampaignDeliveryToRetry(item.outboxEventId)}>{campaignReviewSavingId === item.outboxEventId ? t('common.saving') : t('campaignDrafts.confirmNotSent')}</Button></div></li>)}</ul><div className="sdr-preview-pagination"><Button type="button" aria-label={t('table.previous')} disabled={campaignReviewLoading || campaignReviewOffset === PAGINATION_OFFSET_START} onClick={() => void loadCampaignDeliveryReview(Math.max(PAGINATION_OFFSET_START, campaignReviewOffset - CAMPAIGN_DELIVERY_REVIEW_PAGE_SIZE))}><ChevronLeft size={16} aria-hidden="true" /></Button><span>{t('table.page', { page: Math.floor(campaignReviewOffset / CAMPAIGN_DELIVERY_REVIEW_PAGE_SIZE) + 1, pages: Math.max(PAGINATION_MINIMUM_PAGE_COUNT, Math.ceil(campaignDeliveryReview.pagination.total / CAMPAIGN_DELIVERY_REVIEW_PAGE_SIZE)) })}</span><Button type="button" aria-label={t('table.next')} disabled={campaignReviewLoading || !campaignDeliveryReview.pagination.hasNextPage} onClick={() => void loadCampaignDeliveryReview(campaignReviewOffset + CAMPAIGN_DELIVERY_REVIEW_PAGE_SIZE)}><ChevronRight size={16} aria-hidden="true" /></Button></div></>)}
        </section>
      </div>
      </>}
    </Modal>
    {campaignAudienceDraft && <CampaignAudienceEditor draft={campaignAudienceDraft} onClose={() => setCampaignAudienceDraft(null)} onSaved={() => void loadCampaignDrafts(campaignDrafts?.pagination.offset ?? 0)} />}
    {campaignReadinessDraft && <CampaignOperationalReadinessModal draft={campaignReadinessDraft} onClose={() => setCampaignReadinessDraft(null)} />}
    <Modal open={sdrPreviewOpen} onOpenChange={(open) => { setSdrPreviewOpen(open); if (!open) { setSdrPreview(null); setSdrPreviewError(false); setSdrPreviewChannels([]); setSdrPreviewChannelId('') } }} title={t('sdrPreview.title')} description={t('sdrPreview.description')} closeLabel={t('common.close')} className="sdr-preview-modal">
      {sdrPreviewError ? <WorkspaceState kind="error" compact message={t('sdrPreview.loadFailed')}><Button onClick={() => void loadSdrPreview(sdrPreview?.pagination.offset ?? 0)}>{t('sdrPreview.retry')}</Button></WorkspaceState> : sdrPreviewLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : sdrPreview && <>
        <label className="sdr-preview-channel">{t('sdrPreview.channel')}<SelectField value={sdrPreviewChannelId} onChange={(event) => { const channelId = event.target.value; setSdrPreviewChannelId(channelId); void loadSdrPreview(0, channelId) }}><option value="">{t('sdrPreview.chooseChannel')}</option>{sdrPreviewChannels.map((channel) => <option key={channel.id} value={channel.id} disabled={!channel.isActive || !channel.isConfigured}>{channel.displayName}{channel.businessLineName ? ` · ${channel.businessLineName}` : ''} · {channel.phoneNumber} · {t(channel.isActive ? channel.isConfigured ? 'sdrPreview.channelReady' : 'sdrPreview.channelUnconfigured' : 'sdrPreview.channelInactive')}</option>)}</SelectField></label>
        {sdrPreviewChannels.length === 0 && <p className="form-hint">{t('sdrPreview.noChannels')}</p>}
        <div className="sdr-preview-summary"><strong>{t('sdrPreview.pageCount', { count: sdrPreview.leads.length, total: sdrPreview.pagination.total })}</strong><span>{t('sdrPreview.withoutBlockers', { count: sdrPreview.pageSummary.withoutBlockers })}</span><span>{t('sdrPreview.blocked', { count: sdrPreview.pageSummary.blocked })}</span></div>
        {sdrPreview.leads.length === 0 ? <WorkspaceState kind="empty" message={t('sdrPreview.empty')} /> : <ul className="sdr-preview-list">{sdrPreview.leads.map((lead) => <li key={lead.leadId}><div><strong>{lead.accountName}</strong><small>{lead.contactName ?? t('leadContacts.noPrimary')} · {t(`leads.sources.${lead.source}`)}</small></div>{lead.blockers.length === 0 ? <span className="sdr-preview-ready">{t('sdrPreview.ready')}</span> : <ul>{lead.blockers.map((blocker) => <li key={blocker}>{t(`sdrReadiness.blockers.${blocker}`)}</li>)}</ul>}</li>)}</ul>}
        <div className="sdr-preview-pagination"><Button aria-label={t('table.previous')} disabled={sdrPreview.pagination.offset === PAGINATION_OFFSET_START} onClick={() => void loadSdrPreview(Math.max(PAGINATION_OFFSET_START, sdrPreview.pagination.offset - sdrPreview.pagination.limit))}><ChevronLeft size={16} aria-hidden="true" /></Button><span>{t('table.page', { page: Math.floor(sdrPreview.pagination.offset / sdrPreview.pagination.limit) + 1, pages: Math.max(PAGINATION_MINIMUM_PAGE_COUNT, Math.ceil(sdrPreview.pagination.total / sdrPreview.pagination.limit)) })}</span><Button aria-label={t('table.next')} disabled={!sdrPreview.pagination.hasNextPage} onClick={() => void loadSdrPreview(sdrPreview.pagination.offset + sdrPreview.pagination.limit)}><ChevronRight size={16} aria-hidden="true" /></Button></div>
        <p className="form-hint">{t('sdrPreview.noSend')}</p>
      </>}
    </Modal>
    <Modal open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) { setError(''); setDuplicateCandidates(null); setDuplicateOverrideReason('') } }} title={t('leads.newLead')} description={t('leads.newLeadHint')} closeLabel={t('common.close')} className="lead-create-modal">
    <form className="lead-form" onSubmit={createLead}>
      {businessLines.length === 0 ? <WorkspaceState kind="empty" compact message={t('businessLines.empty')} /> : <div className="lead-fields">
        <label>{t('businessLines.title')}<SelectField value={form.businessLineId} onChange={(event) => updateLeadForm({ businessLineId: event.target.value })} required><option value="" disabled>{t('businessLines.selectLine')}</option>{businessLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</SelectField></label>
        <label>{t('leads.company')}<TextField value={form.accountName} onChange={(event) => updateLeadForm({ accountName: event.target.value })} minLength={2} maxLength={160} required /></label>
        <label>{t('leads.contactName')}<TextField value={form.contactName ?? ''} onChange={(event) => updateLeadForm({ contactName: event.target.value })} minLength={2} maxLength={160} /></label>
        <label>{t('common.email')}<TextField type="email" normalize="email" value={form.email ?? ''} onChange={(event) => updateLeadForm({ email: event.target.value })} /></label>
        <label>{t('common.phone')}<PhoneField value={form.phone ?? ''} onValueChange={(phone) => updateLeadForm({ phone })} /></label>
      </div>}
      <p className="form-hint">{t('leads.contactChannelHint')}</p>
      {duplicateCandidates && <section className="lead-duplicate-review" aria-live="polite"><div><strong>{t('leadDuplicateReview.title')}</strong><p>{t('leadDuplicateReview.hint')}</p></div><ul>{duplicateCandidates.map((candidate) => <li key={candidate.id}><span><strong>{candidate.accountName}{candidate.contactName ? ` · ${candidate.contactName}` : ''}</strong><small>{t(`leadStatuses.${candidate.status}`)} · {candidate.matchedBy.map((match) => t(`leadDuplicateReview.matchedBy.${match}`)).join(', ')}</small></span></li>)}</ul><label>{t('leadDuplicateReview.overrideReason')}<TextareaField value={duplicateOverrideReason} onChange={(event) => setDuplicateOverrideReason(event.target.value)} minLength={3} maxLength={500} required /></label><div className="lead-duplicate-actions"><Button type="button" className="status-change-cancel" disabled={saving} onClick={() => { setDuplicateCandidates(null); setDuplicateOverrideReason('') }}>{t('common.cancel')}</Button><Button type="button" className="primary" disabled={saving || duplicateOverrideReason.trim().length < 3} onClick={() => void saveLead(duplicateOverrideReason.trim())}>{saving ? t('common.saving') : t('leadDuplicateReview.createAnyway')}</Button></div></section>}
      {!duplicateCandidates && <Button className="primary" disabled={saving || checkingDuplicates || businessLines.length === 0}>{checkingDuplicates ? t('leadDuplicateReview.checking') : saving ? t('common.saving') : t('leads.saveLead')}</Button>}
    </form>
    </Modal>
    <Modal open={contactsLead !== null} onOpenChange={(open) => { if (!open) { contactsRequestId.current += 1; setContactsLead(null); setContactsError(''); setAccountContactsError(''); setAccountContacts(null); setQualificationFactsError(''); setQualificationFacts(null); setQualificationFactForm(defaultQualificationFactForm); setContactForm({ name: '', email: '', phone: '', jobTitle: '', isInterested: false, referralNote: '', notes: '' }) } }} title={t('leadContacts.title', { company: contactsLead?.accountName ?? '' })} description={t('leadContacts.description')} closeLabel={t('common.close')} className="lead-contacts-modal">
      {contactsError && <WorkspaceState kind="error" compact message={contactsError} />}
      {contactsLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : <>
        <section className="lead-account-contacts" aria-labelledby="lead-account-contacts-title">
          <header><div><h3 id="lead-account-contacts-title">{t('leadContacts.accountContactsTitle')}</h3><p>{t('leadContacts.accountContactsDescription')}</p></div></header>
          {accountContactsError && <><WorkspaceState kind="error" compact message={accountContactsError} /><Button type="button" onClick={() => contactsLead && void loadAccountContacts(contactsLead.id, accountContactsOffset)}>{t('leadContacts.retryAccountContacts')}</Button></>}
          {accountContactsLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : accountContacts && !accountContactsError && (accountContacts.data.length ? <ul className="lead-account-contact-list">
            {accountContacts.data.map((person) => <li key={person.id}><div><strong>{person.name}</strong><span>{person.email ?? person.phone ?? t('leadContacts.noChannel')}</span></div><Button type="button" disabled={linkingAccountContactId !== EMPTY_IDENTIFIER} onClick={() => void linkAccountContact(person.id)}>{linkingAccountContactId === person.id ? t('common.saving') : t('leadContacts.linkToLead')}</Button></li>)}
          </ul> : <WorkspaceState kind="empty" message={t('leadContacts.noAccountContactsToLink')} />)}
          {accountContacts && accountContacts.pagination.total > LEAD_ACCOUNT_CONTACT_LIMITS.pageSize && <div className="lead-account-contact-pagination">
            <Button type="button" disabled={accountContactsOffset <= LEAD_ACCOUNT_CONTACT_LIMITS.offsetStart || accountContactsLoading} onClick={() => contactsLead && void loadAccountContacts(contactsLead.id, Math.max(LEAD_ACCOUNT_CONTACT_LIMITS.offsetStart, accountContactsOffset - LEAD_ACCOUNT_CONTACT_LIMITS.pageSize))}>{t('common.previousPage')}</Button>
            <span>{t('leadContacts.accountContactsPage', { page: Math.floor(accountContactsOffset / LEAD_ACCOUNT_CONTACT_LIMITS.pageSize) + LEAD_ACCOUNT_CONTACT_LIMITS.pageStart })}</span>
            <Button type="button" disabled={!accountContacts.pagination.hasNextPage || accountContactsLoading} onClick={() => contactsLead && void loadAccountContacts(contactsLead.id, accountContactsOffset + LEAD_ACCOUNT_CONTACT_LIMITS.pageSize)}>{t('common.nextPage')}</Button>
          </div>}
        </section>
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
        <section className="lead-qualification-facts" aria-labelledby="lead-qualification-title">
          <header><div><h3 id="lead-qualification-title">{t('leadQualification.title')}</h3><p>{t('leadQualification.description')}</p></div><div className="lead-qualification-heading-actions">{qualificationFacts && <span>{t('leadQualification.factCount', { count: qualificationFacts.pagination.total })}</span>}<Button type="button" disabled={qualificationSuggestionsLoading} onClick={() => void generateQualificationSuggestions()}><Sparkles size={16} />{qualificationSuggestionsLoading ? t('leadQualification.suggesting') : t('leadQualification.suggest')}</Button></div></header>
          <p className="lead-qualification-suggestion-hint">{t('leadQualification.suggestionReviewHint')}</p>
          {qualificationSuggestionsError && <WorkspaceState kind="error" compact message={qualificationSuggestionsError} />}
          {qualificationSuggestionsLoading && <WorkspaceState kind="loading" compact message={t('leadQualification.suggesting')} />}
          {qualificationSuggestionsGenerated && !qualificationSuggestionsLoading && !qualificationSuggestionsError && (qualificationSuggestions.length ? <section className="lead-qualification-suggestion-list" aria-label={t('leadQualification.suggestionsTitle')}><h4>{t('leadQualification.suggestionsTitle')}</h4><ul>{qualificationSuggestions.map((suggestion) => {
            const key = qualificationSuggestionKey(suggestion)
            return <li key={key}><div className="lead-qualification-fact-heading"><strong>{t(`leadQualification.keys.${suggestion.factKey}`, { defaultValue: suggestion.factKey })}</strong><span>{t(`leadQualification.states.${suggestion.state}`)}</span></div>{suggestion.value !== null && <p>{suggestion.value}</p>}<blockquote>{suggestion.evidence}</blockquote><small>{t('leadQualification.sourceMessageAt', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(suggestion.sourceMessageAt)) })}</small><div className="lead-qualification-suggestion-actions"><Button type="button" disabled={Boolean(savingQualificationSuggestionKey)} onClick={() => void acceptQualificationSuggestion(suggestion)}><Check size={15} />{savingQualificationSuggestionKey === key ? t('common.saving') : t('leadQualification.acceptSuggestion')}</Button><Button type="button" disabled={Boolean(savingQualificationSuggestionKey)} onClick={() => setQualificationSuggestions((current) => current.filter((item) => qualificationSuggestionKey(item) !== key))}><X size={15} />{t('leadQualification.dismissSuggestion')}</Button></div></li>
          })}</ul></section> : <WorkspaceState kind="empty" compact message={t('leadQualification.noSuggestions')} />)}
          {qualificationFactsError && <><WorkspaceState kind="error" compact message={qualificationFactsError} /><Button type="button" onClick={() => contactsLead && void loadQualificationFacts(contactsLead.id, qualificationFactsOffset)}>{t('leadQualification.retry')}</Button></>}
          {qualificationFactsLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : qualificationFacts && !qualificationFactsError && (qualificationFacts.data.length ? <ol className="lead-qualification-fact-list">
            {qualificationFacts.data.map((fact: QualificationFactDto) => <li key={fact.id}>
              <div className="lead-qualification-fact-heading"><strong>{t(`leadQualification.keys.${fact.factKey}`, { defaultValue: fact.factKey })}</strong><span>{t(`leadQualification.states.${fact.state}`)}</span></div>
              {fact.value !== null && <p>{fact.value}</p>}
              {fact.evidence && <small>{t('leadQualification.evidence')}: {fact.evidence}</small>}
              <small>{t(`leadQualification.sources.${fact.source}`)} · {new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(fact.recordedAt))}</small>
            </li>)}
          </ol> : <WorkspaceState kind="empty" message={t('leadQualification.empty')} />)}
          {qualificationFacts && qualificationFacts.pagination.total > LEAD_QUALIFICATION_FACT_LIMITS.pageSize && <div className="lead-qualification-pagination">
            <Button type="button" disabled={qualificationFactsOffset <= LEAD_QUALIFICATION_FACT_LIMITS.offsetStart || qualificationFactsLoading} onClick={() => contactsLead && void loadQualificationFacts(contactsLead.id, Math.max(LEAD_QUALIFICATION_FACT_LIMITS.offsetStart, qualificationFactsOffset - LEAD_QUALIFICATION_FACT_LIMITS.pageSize))}>{t('common.previousPage')}</Button>
            <span>{t('leadQualification.page', { page: Math.floor(qualificationFactsOffset / LEAD_QUALIFICATION_FACT_LIMITS.pageSize) + LEAD_QUALIFICATION_FACT_LIMITS.pageStart })}</span>
            <Button type="button" disabled={!qualificationFacts.pagination.hasNextPage || qualificationFactsLoading} onClick={() => contactsLead && void loadQualificationFacts(contactsLead.id, qualificationFactsOffset + LEAD_QUALIFICATION_FACT_LIMITS.pageSize)}>{t('common.nextPage')}</Button>
          </div>}
          <form className="lead-qualification-form" onSubmit={saveQualificationFact}>
            <h4>{t('leadQualification.add')}</h4>
            <div className="lead-qualification-fields">
              <label>{t('leadQualification.fact')}<SelectField value={qualificationFactForm.factKey} onChange={(event) => { const factKey = LEAD_QUALIFICATION_FACT_KEYS.find((key) => key === event.target.value); if (factKey) setQualificationFactForm((current) => ({ ...current, factKey })) }}>{LEAD_QUALIFICATION_FACT_KEYS.map((key) => <option key={key} value={key}>{t(`leadQualification.keys.${key}`)}</option>)}</SelectField></label>
              <label>{t('leadQualification.state')}<SelectField value={qualificationFactForm.state} onChange={(event) => { const state = LEAD_QUALIFICATION_FACT_STATES.find((item) => item === event.target.value); if (state) setQualificationFactForm((current) => ({ ...current, state, value: state === LEAD_QUALIFICATION_FACT_STATE.unknown || state === LEAD_QUALIFICATION_FACT_STATE.notApplicable ? null : current.value ?? '' })) }}>{LEAD_QUALIFICATION_FACT_STATES.map((state) => <option key={state} value={state}>{t(`leadQualification.states.${state}`)}</option>)}</SelectField></label>
              {qualificationFactForm.state !== LEAD_QUALIFICATION_FACT_STATE.unknown && qualificationFactForm.state !== LEAD_QUALIFICATION_FACT_STATE.notApplicable && <label>{t('leadQualification.value')}<TextField value={qualificationFactForm.value ?? ''} onChange={(event) => setQualificationFactForm((current) => ({ ...current, value: event.target.value }))} maxLength={LEAD_QUALIFICATION_FACT_LIMITS.valueMaxLength} required /></label>}
              {qualificationFactForm.state !== LEAD_QUALIFICATION_FACT_STATE.unknown && qualificationFactForm.state !== LEAD_QUALIFICATION_FACT_STATE.notApplicable && <label>{t('leadQualification.evidence')}<TextareaField value={qualificationFactForm.evidence ?? ''} onChange={(event) => setQualificationFactForm((current) => ({ ...current, evidence: event.target.value }))} minLength={LEAD_QUALIFICATION_FACT_LIMITS.evidenceMinLength} maxLength={LEAD_QUALIFICATION_FACT_LIMITS.valueMaxLength} required /></label>}
            </div>
            <Button className="primary" disabled={qualificationFactsSaving}>{qualificationFactsSaving ? t('common.saving') : t('leadQualification.save')}</Button>
          </form>
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
    <ConfirmDialog open={campaignDeliveryToRetry !== ''} onOpenChange={(open) => { if (!open) setCampaignDeliveryToRetry('') }} title={t('common.confirmAction')} description={t('campaignDrafts.retryNotSentConfirm')} confirmLabel={t('campaignDrafts.confirmNotSent')} cancelLabel={t('common.cancel')} closeLabel={t('common.close')} destructive onConfirm={retryCampaignDelivery} />
  </section>
}
