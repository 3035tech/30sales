import { Button, CheckboxField, IconButton, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Building2, CalendarClock, ChevronLeft, ChevronRight, ClipboardList, Download, Mail, MessageSquareText, Mic, Paperclip, Phone, RefreshCw, SlidersHorizontal, Sparkles, UserRound, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, INBOX_CONTACT_ERROR_CODE, INBOX_MEDIA_ERROR_CODE, INBOX_SEND_ERROR_CODE, type BusinessLineDto, type ChannelDto, type ConversationDto, type MessageAttachmentDto, type MessageDto } from '../lib/api'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import i18n from '../lib/i18n'
import { ASSISTANT_CONVERSATION_ASSIST_MAX_QUESTION_LENGTH, ASSISTANT_CONVERSATION_ASSIST_MODE } from '../lib/agentConstants'
import { INBOX_AUDIO_MIME_PREFIX, INBOX_COMPOSER_MODE, INBOX_COMPOSER_MODES, INBOX_DELIVERY_STATE } from '../lib/inboxConstants'
import { z } from 'zod'
import './InboxWorkspace.css'
import './InboxAttachments.css'

const INBOX_MEDIA_LIMIT_BYTES = 16 * 1024 * 1024
const INBOX_FILE_ACCEPT = 'image/jpeg,image/png,image/webp,video/mp4,video/3gpp,application/pdf'
const INBOX_AUDIO_ACCEPT = 'audio/mpeg,audio/aac,audio/ogg,audio/amr,audio/mp4,audio/wav'
const inboxStreamUpdateSchema = z.object({ conversationId: z.string().uuid() }).passthrough()
const messageUrlPattern = /(https?:\/\/[^\s<>"']+)/gi

function InboxMessageBody({ text }: { text: string }) {
  const parts = text.split(messageUrlPattern)
  return <p>{parts.map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return <span key={index}>{part}</span>
    const match = part.match(/^(.*?)([.,!?;:)\]}]*)$/)
    const urlText = match?.[1] ?? part
    const suffix = match?.[2] ?? ''
    try {
      const url = new URL(urlText)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return <span key={index}>{part}</span>
      return <span key={index}><a href={url.href} target="_blank" rel="noopener noreferrer">{urlText}</a>{suffix}</span>
    } catch {
      return <span key={index}>{part}</span>
    }
  })}</p>
}

export function InboxWorkspace({ initialSearch = '', initialConversationId = '' }: { initialSearch?: string; initialConversationId?: string }) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const globalBusinessLineId = searchParams.get('businessLineId') ?? ''
  const [conversations, setConversations] = useState<ConversationDto[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<MessageDto[]>([])
  const [messagesConversationId, setMessagesConversationId] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [mediaDraft, setMediaDraft] = useState<File | null>(null)
  const [contactMode, setContactMode] = useState(false)
  const [contactDraft, setContactDraft] = useState({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' })
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const conversationQueueRef = useRef<HTMLElement>(null)
  const conversationThreadRef = useRef<HTMLElement>(null)
  const [composerMode, setComposerMode] = useState<(typeof INBOX_COMPOSER_MODES)[number]>(INBOX_COMPOSER_MODE.reply)
  const [tagFilter, setTagFilter] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([])
  const [tagBusy, setTagBusy] = useState(false)
  const [messageKey, setMessageKey] = useState(() => crypto.randomUUID())
  const [sendingMessage, setSendingMessage] = useState(false)
  const [unknownDeliveryPending, setUnknownDeliveryPending] = useState(false)
  const [draftingReply, setDraftingReply] = useState(false)
  const [assistantConsultOpen, setAssistantConsultOpen] = useState(false)
  const [assistantConsultMode, setAssistantConsultMode] = useState<(typeof ASSISTANT_CONVERSATION_ASSIST_MODE)[keyof typeof ASSISTANT_CONVERSATION_ASSIST_MODE]>(ASSISTANT_CONVERSATION_ASSIST_MODE.summary)
  const [assistantQuestion, setAssistantQuestion] = useState('')
  const [assistantQuestionValidationAttempted, setAssistantQuestionValidationAttempted] = useState(false)
  const [assistantConsultResult, setAssistantConsultResult] = useState<Awaited<ReturnType<typeof api.agents.assistConversation>> | null>(null)
  const [assistantConsultError, setAssistantConsultError] = useState(false)
  const [assistantConsultLoading, setAssistantConsultLoading] = useState(false)
  const [messageSendError, setMessageSendError] = useState('')
  const [channels, setChannels] = useState<ChannelDto[]>([])
  const [businessLines, setBusinessLines] = useState<BusinessLineDto[]>([])
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [assigneeTarget, setAssigneeTarget] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [controlling, setControlling] = useState(false)
  const [channelFilter, setChannelFilter] = useState('')
  const [businessLineFilter, setBusinessLineFilter] = useState('')
  const [conversationSearch, setConversationSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ConversationDto['status'] | ''>('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [contactContextOpen, setContactContextOpen] = useState(false)
  const [conversationIdFilter, setConversationIdFilter] = useState(initialConversationId)
  const [pageSize, setPageSize] = useState(25)
  const [offset, setOffset] = useState(0)
  const [conversationTotal, setConversationTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesLoadError, setMessagesLoadError] = useState(false)
  const [error, setError] = useState('')
  const [reconcileOpen, setReconcileOpen] = useState(false)
  const [leadSearch, setLeadSearch] = useState('')
  const [leadOptions, setLeadOptions] = useState<Array<{ id: string; accountName: string; contactName: string | null; phone: string | null }>>([])

  useEffect(() => { setBusinessLineFilter(globalBusinessLineId); setChannelFilter(''); setOffset(0) }, [globalBusinessLineId])
  const [reconcileLeadId, setReconcileLeadId] = useState('')
  const [reconcileLead, setReconcileLead] = useState<{ id: string; accountName: string; contactName: string | null; phone: string | null } | null>(null)
  const [leadSearchLoading, setLeadSearchLoading] = useState(false)
  const [leadSearchFailed, setLeadSearchFailed] = useState(false)
  const [confirmedName, setConfirmedName] = useState('')
  const [confirmedPhone, setConfirmedPhone] = useState('')
  const [markAsPrimary, setMarkAsPrimary] = useState(false)
  const [markAsInterested, setMarkAsInterested] = useState(false)
  const [reconciling, setReconciling] = useState(false)
  const [reconcileError, setReconcileError] = useState('')
  const refreshSequence = useRef(0)
  const readCursorKey = useRef('')
  const skipUnreadAutoSelect = useRef(false)
  const refreshMessagesRef = useRef<() => void>(() => {})
  const refreshRef = useRef<(quiet?: boolean) => Promise<void>>(async () => {})
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId

  const refresh = useCallback(async (quiet = false) => {
    const sequence = ++refreshSequence.current
    if (!quiet) { setLoading(true); setError('') }
    try {
      const result = await api.inbox.conversations({ conversationId: conversationIdFilter || undefined, businessLineId: businessLineFilter || undefined, channelId: channelFilter || undefined, tagId: tagFilter || undefined, status: statusFilter || undefined, ownerUserId: ownerFilter || undefined, search: debouncedSearch || undefined, unreadOnly, limit: pageSize, offset })
      if (sequence !== refreshSequence.current) return
      setConversations(result.data)
      setConversationTotal(result.pagination.total)
      setSelectedId((current) => {
        if (result.data.some((conversation) => conversation.id === current)) {
          skipUnreadAutoSelect.current = false
          return current
        }
        if (skipUnreadAutoSelect.current) {
          skipUnreadAutoSelect.current = false
          return ''
        }
        return result.data[0]?.id ?? ''
      })
    } catch {
      if (sequence !== refreshSequence.current || quiet) return
      setError(t('inbox.loadFailed'))
    } finally {
      if (sequence === refreshSequence.current) setLoading(false)
    }
  }, [conversationIdFilter, businessLineFilter, channelFilter, tagFilter, statusFilter, ownerFilter, debouncedSearch, unreadOnly, pageSize, offset, t])
  refreshRef.current = refresh

  useEffect(() => { api.inbox.channels().then(setChannels).catch(() => setChannels([])) }, [])
  useEffect(() => { api.businessLines.list().then((result) => setBusinessLines(result.data.filter((line) => line.status === 'active'))).catch(() => setBusinessLines([])) }, [])
  useEffect(() => { api.inbox.tags().then(setTags).catch(() => setTags([])) }, [])
  useEffect(() => { api.inbox.assignees().then(setAssignees).catch(() => setAssignees([])) }, [])
  useEffect(() => { api.session.get().then((session) => setCurrentUserId(session.user.id)).catch(() => setCurrentUserId('')) }, [])
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(conversationSearch.trim()), 250); return () => window.clearTimeout(timer) }, [conversationSearch])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { setMessageDraft(''); setMediaDraft(null); setContactMode(false); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }); setMessageKey(crypto.randomUUID()); setMessageSendError(''); setUnknownDeliveryPending(false); setComposerMode(INBOX_COMPOSER_MODE.reply) }, [selectedId])
  useEffect(() => {
    if (!selectedId) { setMessages([]); setMessagesConversationId(''); return }
    let active = true
    let requestInFlight = false
    setMessages([])
    setMessagesConversationId('')
    setMessagesLoadError(false)
    setMessagesLoading(true)
    const loadMessages = async (initial = false) => {
      if (requestInFlight) return
      requestInFlight = true
      try {
        const result = await api.inbox.messages(selectedId, { limit: 100 })
        if (active) {
          setMessagesLoadError(false)
          setMessages((current) => current.length === result.length && current.every((message, index) => {
            const next = result[index]
            return message.id === next?.id && message.deliveryState === next.deliveryState && message.bodyText === next.bodyText && message.transcriptText === next.transcriptText && message.isDeleted === next.isDeleted && JSON.stringify(message.providerMetadata) === JSON.stringify(next.providerMetadata) && JSON.stringify(message.attachments) === JSON.stringify(next.attachments)
          }) ? current : result)
          setMessagesConversationId(selectedId)
        }
      } catch {
        if (active) setMessagesLoadError(true)
      } finally {
        requestInFlight = false
        if (active && initial) setMessagesLoading(false)
      }
    }
    const reloadMessages = () => { void loadMessages() }
    refreshMessagesRef.current = reloadMessages
    void loadMessages(true)
    return () => {
      active = false
      if (refreshMessagesRef.current === reloadMessages) refreshMessagesRef.current = () => {}
    }
  }, [selectedId, t])
  useEffect(() => {
    let active = true
    let stream: EventSource | null = null
    let fallbackRefresh: number | null = null
    const refreshOnConnect = () => {
      if (document.visibilityState !== 'visible') return
      void refreshRef.current(true)
      refreshMessagesRef.current()
    }
    const startFallbackRefresh = () => {
      if (fallbackRefresh === null) fallbackRefresh = window.setInterval(refreshOnConnect, 30000)
    }
    const stopFallbackRefresh = () => {
      if (fallbackRefresh !== null) window.clearInterval(fallbackRefresh)
      fallbackRefresh = null
    }
    const refreshOnConversationUpdate = (event: Event) => {
      if (document.visibilityState !== 'visible') return
      void refreshRef.current(true)
      try {
        if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return
        const parsed: unknown = JSON.parse(event.data)
        const update = inboxStreamUpdateSchema.safeParse(parsed)
        if (update.success && update.data.conversationId === selectedIdRef.current) refreshMessagesRef.current()
      } catch { /* Ignore malformed event data; the next update will retry the refresh. */ }
    }
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') refreshOnConnect()
    }
    document.addEventListener('visibilitychange', refreshOnReturn)
    void api.inbox.subscribe().then((connection) => {
      if (!active) {
        connection.close()
        return
      }
      stream = connection
      stream.addEventListener('ready', () => {
        stopFallbackRefresh()
        refreshOnConnect()
      })
      stream.addEventListener('conversation.updated', refreshOnConversationUpdate)
      stream.addEventListener('error', startFallbackRefresh)
    }).catch(startFallbackRefresh)
    return () => {
      active = false
      stream?.close()
      stopFallbackRefresh()
      document.removeEventListener('visibilitychange', refreshOnReturn)
    }
  }, [])
  useEffect(() => {
    const lastInbound = [...messages].reverse().find((message) => message.direction === 'inbound')
    if (!selectedId || messagesConversationId !== selectedId || !lastInbound) return
    const cursor = `${selectedId}:${lastInbound.id}`
    if (readCursorKey.current === cursor) return
    readCursorKey.current = cursor
    api.inbox.markRead(selectedId, lastInbound.id).then(() => {
      if (unreadOnly) skipUnreadAutoSelect.current = true
      void refresh()
    }).catch(() => { readCursorKey.current = '' })
  }, [messages, messagesConversationId, selectedId, unreadOnly, refresh])

  const selected = conversations.find((conversation) => conversation.id === selectedId)
  useEffect(() => { setAssistantConsultOpen(false); setAssistantConsultResult(null); setAssistantConsultError(false) }, [selectedId])
  const hasConversationFilters = Boolean(conversationIdFilter || businessLineFilter || channelFilter || tagFilter || statusFilter || ownerFilter || unreadOnly || conversationSearch.trim())
  const quickView = unreadOnly ? 'unread' : currentUserId && ownerFilter === currentUserId ? 'mine' : ownerFilter === 'unassigned' ? 'unassigned' : 'all'
  const applyQuickView = (view: 'all' | 'mine' | 'unassigned' | 'unread') => {
    setUnreadOnly(view === 'unread')
    setOwnerFilter(view === 'mine' ? currentUserId : view === 'unassigned' ? 'unassigned' : '')
    setOffset(0)
  }
  const clearConversationFilters = () => { setConversationIdFilter(''); setConversationSearch(''); setDebouncedSearch(''); setStatusFilter(''); setOwnerFilter(''); setUnreadOnly(false); setBusinessLineFilter(''); setChannelFilter(''); setTagFilter(''); setOffset(0) }
  const canSend = Boolean(selected && selected.ownerUserId === currentUserId && selected.automationMode === 'human' && selected.replyAvailable)
  const canAddNote = Boolean(selected && selected.ownerUserId === currentUserId)
  const canEditTags = Boolean(selected && selected.ownerUserId === currentUserId)
  useEffect(() => { if (selected) setAssigneeTarget(selected.ownerUserId ?? assignees[0]?.id ?? '') }, [selected?.id, selected?.ownerUserId, assignees])
  const controlConversation = async (action: 'claim' | 'release' | 'assistant' | 'pause' | 'assign' | 'resolve' | 'reopen') => {
    if (!selected) return
    setControlling(true)
    setError('')
    try {
      if (action === 'claim') await api.inbox.claim(selected.id)
      else if (action === 'release') await api.inbox.release(selected.id)
      else if (action === 'assign') await api.inbox.assign(selected.id, assigneeTarget)
      else if (action === 'resolve' || action === 'reopen') await api.inbox.setStatus(selected.id, action === 'resolve' ? 'resolved' : 'open')
      else await api.inbox.setAutomationMode(selected.id, action === 'assistant' ? 'assistant' : 'paused')
      await refresh()
    } catch {
      setError(t('inbox.controlFailed'))
    } finally {
      setControlling(false)
    }
  }
  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || (composerMode === INBOX_COMPOSER_MODE.reply ? !canSend : !canAddNote) || (!contactMode && !messageDraft.trim() && !mediaDraft) || (contactMode && (!contactDraft.fullName.trim() || !contactDraft.phoneNumber.trim())) || (composerMode === INBOX_COMPOSER_MODE.note && mediaDraft) || (mediaDraft?.type.startsWith(INBOX_AUDIO_MIME_PREFIX) && messageDraft.trim())) return
    setSendingMessage(true); setMessageSendError('')
    try {
      const message = composerMode === INBOX_COMPOSER_MODE.reply
        ? contactMode
          ? await api.inbox.sendContactMessage(selected.id, { fullName: contactDraft.fullName.trim(), phoneNumber: contactDraft.phoneNumber.trim(), ...(contactDraft.organization.trim() ? { organization: contactDraft.organization.trim() } : {}), ...(contactDraft.email.trim() ? { email: contactDraft.email.trim() } : {}), ...(contactDraft.url.trim() ? { url: contactDraft.url.trim() } : {}), idempotencyKey: messageKey })
          : mediaDraft
          ? await api.inbox.sendMediaMessage(selected.id, { bodyText: messageDraft, idempotencyKey: messageKey, file: mediaDraft })
          : await api.inbox.sendMessage(selected.id, { bodyText: messageDraft, idempotencyKey: messageKey })
        : await api.inbox.addNote(selected.id, { bodyText: messageDraft, idempotencyKey: messageKey })
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
      if (composerMode === INBOX_COMPOSER_MODE.reply && message.deliveryState === INBOX_DELIVERY_STATE.unknown) {
        setUnknownDeliveryPending(true)
        setMessageSendError(t('inboxRetry.deliveryUnknown'))
      } else {
        setMessageDraft(''); setMediaDraft(null); setContactMode(false); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }); setMessageKey(crypto.randomUUID())
        if (composerMode === INBOX_COMPOSER_MODE.reply && message.deliveryState === INBOX_DELIVERY_STATE.failed) setMessageSendError(t('inbox.deliveryFailed'))
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === INBOX_MEDIA_ERROR_CODE.unsupportedType) setMessageSendError(t('inboxComposer.mediaUnsupported'))
      else if (error instanceof ApiError && error.code === INBOX_MEDIA_ERROR_CODE.invalidContent) setMessageSendError(t('inboxComposer.mediaInvalid'))
      else if (error instanceof ApiError && error.code === INBOX_MEDIA_ERROR_CODE.tooLarge) setMessageSendError(t('inboxComposer.mediaTooLarge'))
      else if (error instanceof ApiError && error.code === INBOX_MEDIA_ERROR_CODE.audioCaptionUnsupported) setMessageSendError(t('inboxComposer.audioCaptionUnsupported'))
      else if (error instanceof ApiError && error.code === INBOX_CONTACT_ERROR_CODE.invalidPhone) setMessageSendError(t('inbox.contactReconciliation.invalidPhone'))
      else if (error instanceof ApiError && error.code === INBOX_SEND_ERROR_CODE.dailyChannelLimitReached) setMessageSendError(t('inbox.dailyChannelLimitReached'))
      else if (error instanceof ApiError && error.code === INBOX_SEND_ERROR_CODE.channelConnectionUnavailable) setMessageSendError(t('inbox.channelConnectionUnavailable'))
      else setMessageSendError(t('inbox.sendFailed'))
    } finally { setSendingMessage(false) }
  }
  const draftReplyWithAssistant = async () => {
    if (!selected || !canSend || draftingReply) return
    setDraftingReply(true); setMessageSendError('')
    try {
      const result = await api.agents.draftConversationReply(selected.id)
      setComposerMode(INBOX_COMPOSER_MODE.reply); setMessageDraft(result.draftText); setMediaDraft(null)
    } catch {
      setMessageSendError(t('inboxComposer.aiDraftFailed'))
    } finally {
      setDraftingReply(false)
    }
  }
  const consultAssistant = async (event: React.FormEvent) => {
    event.preventDefault()
    const questionMissing = assistantConsultMode === ASSISTANT_CONVERSATION_ASSIST_MODE.question && !assistantQuestion.trim()
    if (questionMissing) setAssistantQuestionValidationAttempted(true)
    if (!selected || !canSend || assistantConsultLoading || questionMissing) return
    setAssistantConsultLoading(true); setAssistantConsultError(false)
    try {
      const result = await api.agents.assistConversation(selected.id, { mode: assistantConsultMode, question: assistantConsultMode === ASSISTANT_CONVERSATION_ASSIST_MODE.question ? assistantQuestion.trim() : undefined })
      setAssistantConsultResult(result)
    } catch { setAssistantConsultError(true) }
    finally { setAssistantConsultLoading(false) }
  }
  const selectMedia = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    if (!file) return
    if (file.size > INBOX_MEDIA_LIMIT_BYTES) { setMessageSendError(t('inboxComposer.mediaTooLarge')); return }
    if (contactMode) { setContactMode(false); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }) }
    setMediaDraft(file)
    setMessageSendError(file.type.startsWith(INBOX_AUDIO_MIME_PREFIX) && messageDraft.trim() ? t('inboxComposer.audioCaptionUnsupported') : '')
  }
  const addTag = async () => {
    if (!selected || !canEditTags || !tagDraft.trim()) return
    setTagBusy(true); setError('')
    try {
      await api.inbox.addTag(selected.id, tagDraft.trim())
      setTagDraft('')
      const nextTags = await api.inbox.tags()
      setTags(nextTags)
      await refresh()
    } catch { setError(t('inboxComposer.tagFailed')) }
    finally { setTagBusy(false) }
  }
  const openContactReconciliation = () => {
    if (!selected) return
    setLeadSearch(''); setLeadOptions([]); setReconcileLeadId(''); setReconcileLead(null); setLeadSearchFailed(false); setConfirmedName(selected.personName ?? ''); setConfirmedPhone(selected.personPhone ?? ''); setMarkAsPrimary(false); setMarkAsInterested(false); setReconcileError(''); setReconcileOpen(true)
  }
  useEffect(() => {
    if (!reconcileOpen || leadSearch.trim().length < 2) { setLeadOptions([]); setLeadSearchLoading(false); setLeadSearchFailed(false); return }
    let active = true
    setLeadSearchLoading(true); setLeadSearchFailed(false)
    const timer = window.setTimeout(() => { void api.leads.listPage({ businessLineId: selected?.businessLineId ?? undefined, search: leadSearch.trim(), limit: 10, offset: 0 }).then((result) => { if (active) setLeadOptions(result.data.map((lead) => ({ id: lead.id, accountName: lead.accountName, contactName: lead.contactName, phone: lead.phone }))) }).catch(() => { if (active) { setLeadOptions([]); setLeadSearchFailed(true) } }).finally(() => { if (active) setLeadSearchLoading(false) }) }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [reconcileOpen, leadSearch, selected?.businessLineId])
  const saveContactReconciliation = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !reconcileLeadId) return
    setReconciling(true); setReconcileError('')
    try {
      await api.inbox.reconcileContact(selected.id, { leadId: reconcileLeadId, ...(confirmedName.trim() ? { name: confirmedName.trim() } : {}), ...(confirmedPhone.trim() ? { phone: confirmedPhone.trim() } : {}), isPrimary: markAsPrimary, isInterested: markAsInterested })
      setReconcileOpen(false)
      await refresh()
    } catch (error) { setReconcileError(error instanceof ApiError && error.code === INBOX_CONTACT_ERROR_CODE.invalidPhone ? t('inbox.contactReconciliation.invalidPhone') : t('inbox.contactReconciliation.failed')) }
    finally { setReconciling(false) }
  }
  const removeTag = async (tagId: string) => {
    if (!selected || !canEditTags) return
    setTagBusy(true); setError('')
    try {
      await api.inbox.removeTag(selected.id, tagId)
      await refresh()
    } catch { setError(t('inboxComposer.tagFailed')) }
    finally { setTagBusy(false) }
  }
  const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : t('inbox.noMessagesYet')
  const downloadAttachment = async (attachment: MessageAttachmentDto) => {
    try {
      const content = await api.inbox.downloadAttachment(attachment.id)
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = url; link.download = attachment.fileName ?? t('inbox.attachmentFallback'); link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError(t('inbox.attachmentDownloadFailed')) }
  }

  return <section className={`inbox-page${contactContextOpen ? '' : ' inbox-context-collapsed'}`}>
    <header className="inbox-heading"><div><p className="eyebrow">{t('inbox.eyebrow')}</p><h2>{t('inbox.title')}</h2><p className="muted">{t('inbox.description')}</p></div>
      <Button className="refresh" disabled={sendingMessage} onClick={() => void refresh()} aria-label={t('inbox.refresh')}><RefreshCw size={16} /></Button>
    </header>
    {error && <WorkspaceState kind="error" compact message={error} />}
    <div className="inbox-layout">
      <aside id="inbox-contact-context" className="inbox-contact-panel" aria-label={t('inbox.leadDetails')}>
        {!selected ? <WorkspaceState kind="empty" compact message={t('inbox.selectConversation')} /> : <>
          <div className="inbox-contact-identity"><span><UserRound size={21} /></span><div><h3>{selected.conversationType === 'group' ? selected.displayName ?? t('inbox.groupConversation') : selected.personName ?? t('inbox.unknownContact')}</h3><p>{selected.conversationType === 'group' ? t('inbox.groupConversation') : selected.accountName ?? t('inbox.noCompany')}</p></div></div>
          <section className="inbox-contact-section"><h4>{t('inbox.contactDetails')}</h4><dl>
            <div><dt><Mail size={14} />{t('inbox.email')}</dt><dd>{selected.personEmail ?? '—'}</dd></div>
            <div><dt><Phone size={14} />{t('inbox.phone')}</dt><dd>{selected.personPhone ?? '—'}</dd></div>
            <div><dt><Building2 size={14} />{t('inbox.company')}</dt><dd>{selected.accountName ?? '—'}</dd></div>
          </dl></section>
          {selected.ownerUserId === currentUserId && <Button type="button" onClick={openContactReconciliation}>{t('inbox.contactReconciliation.action')}</Button>}
          <section className="inbox-contact-section"><h4>{t('inbox.leadContext')}</h4><dl>
            <div><dt>{t('inbox.leadStatus')}</dt><dd>{selected.lead ? t(`leadStatuses.${selected.lead.status}`, { defaultValue: selected.lead.status }) : t('inbox.noLead')}</dd></div>
            <div><dt>{t('inbox.leadSource')}</dt><dd>{selected.lead ? t(`leads.sources.${selected.lead.source}`, { defaultValue: selected.lead.source }) : '—'}</dd></div>
            <div><dt><CalendarClock size={14} />{t('inbox.nextAction')}</dt><dd>{selected.lead?.nextActionAt ? formatDate(selected.lead.nextActionAt) : '—'}</dd></div>
            <div><dt>{t('inbox.owner')}</dt><dd>{selected.ownerName ?? t('inbox.unassigned')}</dd></div>
            <div><dt>{t('inbox.channel')}</dt><dd>{selected.channelName ?? selected.provider}</dd></div>
            <div><dt>{t('inbox.statusLabel')}</dt><dd>{t(`inbox.status.${selected.status}`)}</dd></div>
          </dl></section>
          {selected.assistantQualification && <section className="inbox-qualification" aria-label={t('assistantQualification.title')}><header><ClipboardList size={17} /><strong>{t('assistantQualification.title')}</strong><span>{t(`assistantQualification.intents.${selected.assistantQualification.intent}`)}</span></header><p>{selected.assistantQualification.summary}</p><div className="inbox-qualification-columns"><div><strong>{t('assistantQualification.confirmed')}</strong>{selected.assistantQualification.confirmedFacts.length ? <ul>{selected.assistantQualification.confirmedFacts.map((fact, index) => <li key={`${index}-${fact}`}>{fact}</li>)}</ul> : <p>{t('assistantQualification.none')}</p>}</div><div><strong>{t('assistantQualification.unknowns')}</strong>{selected.assistantQualification.unknowns.length ? <ul>{selected.assistantQualification.unknowns.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>{t('assistantQualification.none')}</p>}</div></div><div className="inbox-qualification-next"><strong>{t('assistantQualification.nextStep')}</strong><p>{selected.assistantQualification.nextStep}</p></div><small>{t('assistantQualification.updated', { date: new Date(selected.assistantQualification.updatedAt).toLocaleString(i18n.language) })}</small></section>}
          <div className="inbox-tag-manager"><strong>{t('inboxComposer.tagsLabel')}</strong><div className="inbox-tag-list">{selected.tags.map((tag) => <span key={tag.id}>{tag.name}{canEditTags && <IconButton label={t('inboxComposer.removeTag', { name: tag.name })} disabled={tagBusy} onClick={() => void removeTag(tag.id)}><X size={12} aria-hidden="true" /></IconButton>}</span>)}</div>{canEditTags && <div><TextField value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} maxLength={32} placeholder={t('inboxComposer.tagPlaceholder')} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addTag() } }} /><Button type="button" disabled={tagBusy || tagDraft.trim().length < 2} onClick={() => void addTag()}>{tagBusy ? t('common.saving') : t('inboxComposer.addTag')}</Button></div>}</div>
        </>}
      </aside>
      <section ref={conversationThreadRef} className="inbox-thread" aria-label={t('inbox.thread')}>
        {!selected ? <WorkspaceState kind={loading ? 'loading' : 'empty'} message={loading ? t('common.loading') : t('inbox.selectConversation')} detail={t('inbox.readOnly')} /> : <>
          <header className="inbox-thread-heading"><div><Button type="button" className="inbox-mobile-queue-nav" onClick={() => conversationQueueRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}><ArrowLeft size={15} />{t('inbox.conversationList')}</Button><strong>{selected.conversationType === 'group' ? selected.displayName ?? t('inbox.groupConversation') : selected.personName ?? selected.accountName ?? t('inbox.unknownContact')}</strong><span>{selected.conversationType === 'group' ? t('inbox.groupConversation') : selected.personPhone ?? selected.channelName ?? selected.provider}</span><small>{t('inbox.owner')}: {selected.ownerName ?? t('inbox.unassigned')} · {t('inbox.automation')}: {t(`inbox.modes.${selected.automationMode}`)}</small></div><div className="inbox-control-actions">
            <Button type="button" className="inbox-context-toggle" aria-controls="inbox-contact-context" aria-expanded={contactContextOpen} onClick={() => setContactContextOpen((open) => !open)}><UserRound size={15} />{t('inbox.leadDetails')}</Button>
            {(!selected.ownerUserId || selected.ownerUserId === currentUserId) && assignees.length > 0 && <><label className="inbox-assignee-select"><span>{t('inbox.assignTo')}</span><SelectField value={assigneeTarget} onChange={(event) => setAssigneeTarget(event.target.value)} disabled={controlling}><option value="" disabled>{t('inbox.selectAssignee')}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</SelectField></label><Button type="button" disabled={controlling || !assigneeTarget} onClick={() => void controlConversation('assign')}>{t('inbox.assign')}</Button></>}
            {!selected.ownerUserId && <Button type="button" disabled={controlling} onClick={() => void controlConversation('claim')}>{controlling ? t('inbox.claiming') : t('inbox.claim')}</Button>}
            {selected.ownerUserId === currentUserId && selected.automationMode === 'human' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('pause')}>{t('inbox.pauseAssistant')}</Button>}
            {selected.automationMode === 'paused' && (!selected.ownerUserId || selected.ownerUserId === currentUserId) && <Button type="button" disabled={controlling} onClick={() => void controlConversation('assistant')}>{t('inbox.resumeAssistant')}</Button>}
            {selected.ownerUserId === currentUserId && <Button type="button" disabled={controlling} onClick={() => void controlConversation('release')}>{t('inbox.release')}</Button>}
            {selected.ownerUserId === currentUserId && selected.status !== 'resolved' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('resolve')}>{t('inbox.resolve')}</Button>}
            {selected.ownerUserId === currentUserId && selected.status === 'resolved' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('reopen')}>{t('inbox.reopen')}</Button>}
            <span className="tag">{t(`inbox.status.${selected.status}`)}</span></div></header>
          <div className="inbox-messages" role="log" aria-label={t('inbox.thread')} aria-relevant="additions text" aria-atomic="false">
            {messagesLoading ? <div className="inbox-message-state"><WorkspaceState kind="loading" compact message={t('common.loading')} /></div> : messagesLoadError && messages.length === 0 ? <div className="inbox-message-state"><WorkspaceState kind="error" compact message={t('inbox.messagesFailed')}><Button type="button" onClick={() => refreshMessagesRef.current()}>{t('platform.retry')}</Button></WorkspaceState></div> : <>{messagesLoadError && <WorkspaceState kind="error" compact message={t('inbox.messagesFailed')} detail={t('table.resultsRetained')}><Button type="button" onClick={() => refreshMessagesRef.current()}>{t('platform.retry')}</Button></WorkspaceState>}{messages.length === 0 ? <div className="inbox-message-state"><WorkspaceState kind="empty" compact message={t('inbox.noMessagesYet')} detail={t('inbox.emptyMessagesHint')} /></div> : messages.map((message) => <article key={message.id} className={`inbox-message ${message.direction}`}>
              <div className="inbox-message-meta"><span>{message.direction === 'internal' ? t('inboxComposer.internalNoteBy', { name: message.actorName ?? t('inbox.actor.user') }) : t(`inbox.actor.${message.actorType}`)}</span><time dateTime={message.occurredAt}>{formatDate(message.occurredAt)}</time></div>
              {message.isDeleted ? <p className="inbox-message-deleted">{t('inbox.messageDeleted')}</p> : <>{selected.conversationType === 'group' && message.direction === 'inbound' && message.providerMetadata?.evolution?.author?.name && <small className="inbox-group-author">{message.providerMetadata.evolution.author.name}</small>}{message.providerMetadata?.evolution?.quotedMessage?.bodyText && <blockquote className="inbox-message-quote">{message.providerMetadata.evolution.quotedMessage.bodyText}</blockquote>}{message.providerMetadata?.evolution?.reaction && <small>{t('inbox.reactionContext')}</small>}{message.bodyText ? <InboxMessageBody text={message.bodyText} /> : !message.transcriptText && message.attachments.length === 0 && <p>{t('inbox.nonTextMessage')}</p>}{message.providerMetadata?.evolution?.richContent?.kind === 'poll' && <div className="inbox-poll"><strong>{t('inbox.pollOptions')}</strong><ul>{message.providerMetadata.evolution.richContent.options.map((option, index) => <li key={`${index}:${option}`}>{option}</li>)}</ul></div>}{message.transcriptText && <p className="inbox-transcript"><strong>{t('inbox.transcript')}</strong> {message.transcriptText}</p>}{message.attachments.map((attachment) => <div className="inbox-attachment" key={attachment.id}><Paperclip size={14} /><span>{attachment.fileName ?? t(`inbox.mediaTypes.${attachment.mediaType}`)}<small>{attachment.status === 'available' ? attachment.mimeType ?? t('inbox.attachmentReady') : t(`inbox.attachmentStatus.${attachment.status}`)}</small></span>{attachment.status === 'available' && <IconButton label={t('inbox.downloadAttachment', { name: attachment.fileName ?? t(`inbox.mediaTypes.${attachment.mediaType}`) })} onClick={() => void downloadAttachment(attachment)}><Download size={14} aria-hidden="true" /></IconButton>}</div>)}</>}{message.direction !== 'internal' && <small>{t(`inbox.delivery.${message.deliveryState}`)}</small>}
            </article>)}</>}
          </div>
          <form className="inbox-composer" onSubmit={sendMessage}>
            <div className="inbox-composer-modes"><Button type="button" className={composerMode === INBOX_COMPOSER_MODE.reply ? 'active' : ''} onClick={() => { setComposerMode(INBOX_COMPOSER_MODE.reply); setMessageSendError('') }} disabled={sendingMessage}>{t('inboxComposer.replyMode')}</Button><Button type="button" className={composerMode === INBOX_COMPOSER_MODE.note ? 'active' : ''} onClick={() => { setComposerMode(INBOX_COMPOSER_MODE.note); setMessageSendError('') }} disabled={sendingMessage || Boolean(mediaDraft) || contactMode}>{t('inboxComposer.noteMode')}</Button></div>
            {composerMode === INBOX_COMPOSER_MODE.reply && !canSend && <p>{t('inbox.replyUnavailable')}</p>}
            {composerMode === INBOX_COMPOSER_MODE.note && !canAddNote && <p>{t('inboxComposer.noteUnavailable')}</p>}
            <TextareaField value={messageDraft} onChange={(event) => { setMessageDraft(event.target.value); setMessageSendError(mediaDraft?.type.startsWith(INBOX_AUDIO_MIME_PREFIX) && event.target.value.trim() ? t('inboxComposer.audioCaptionUnsupported') : '') }} maxLength={4096} placeholder={t(composerMode === INBOX_COMPOSER_MODE.note ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} disabled={(composerMode === INBOX_COMPOSER_MODE.reply ? !canSend : !canAddNote) || sendingMessage || contactMode} aria-label={t(composerMode === INBOX_COMPOSER_MODE.note ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} />
            {composerMode === INBOX_COMPOSER_MODE.reply && <div className="inbox-composer-tools"><input ref={attachmentInputRef} type="file" accept={INBOX_FILE_ACCEPT} hidden onChange={selectMedia} /><input ref={audioInputRef} type="file" accept={INBOX_AUDIO_ACCEPT} hidden onChange={selectMedia} /><Button type="button" className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || contactMode} onClick={() => void draftReplyWithAssistant()}><Sparkles size={15} />{draftingReply ? t('inboxComposer.aiDrafting') : t('inboxComposer.aiDraft')}</Button><Button type="button" className="inbox-media-action" disabled={!canSend || assistantConsultLoading || contactMode} onClick={() => { setAssistantConsultMode(ASSISTANT_CONVERSATION_ASSIST_MODE.summary); setAssistantQuestion(''); setAssistantQuestionValidationAttempted(false); setAssistantConsultResult(null); setAssistantConsultError(false); setAssistantConsultOpen(true) }}><MessageSquareText size={15} />{t('inboxComposer.aiConsult')}</Button><Button type="button" className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || contactMode} onClick={() => attachmentInputRef.current?.click()}><Paperclip size={15} />{t('inboxComposer.attachFile')}</Button><Button type="button" className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || contactMode} onClick={() => audioInputRef.current?.click()}><Mic size={15} />{t('inboxComposer.attachAudio')}</Button><Button type="button" className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || Boolean(mediaDraft)} onClick={() => { setContactMode((active) => !active); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }); setMessageDraft(''); setMessageSendError('') }}><UserRound size={15} />{t(contactMode ? 'inboxComposer.cancelContact' : 'inboxComposer.attachContact')}</Button>{mediaDraft && <span className="inbox-media-selection"><span>{mediaDraft.type.startsWith(INBOX_AUDIO_MIME_PREFIX) ? <Mic size={14} /> : <Paperclip size={14} />}{mediaDraft.name}</span><small>{(mediaDraft.size / 1024 / 1024).toFixed(1)} MiB</small><IconButton label={t('inboxComposer.removeAttachment')} disabled={sendingMessage} onClick={() => { setMediaDraft(null); setMessageSendError('') }}><X size={15} /></IconButton></span>}</div>}
            {contactMode && <div className="inbox-contact-draft"><label>{t('inboxComposer.contactName')}<TextField required maxLength={160} value={contactDraft.fullName} onChange={(event) => setContactDraft((current) => ({ ...current, fullName: event.target.value }))} /></label><label>{t('inboxComposer.contactPhone')}<TextField required type="tel" maxLength={40} value={contactDraft.phoneNumber} onChange={(event) => setContactDraft((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="+55 11 99999-0000" /></label><label>{t('inboxComposer.contactOrganization')}<TextField maxLength={160} value={contactDraft.organization} onChange={(event) => setContactDraft((current) => ({ ...current, organization: event.target.value }))} /></label><label>{t('inboxComposer.contactEmail')}<TextField type="email" maxLength={254} value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} /></label><label>{t('inboxComposer.contactUrl')}<TextField type="url" maxLength={2048} value={contactDraft.url} onChange={(event) => setContactDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://" /></label></div>}
            {messageSendError && <div className="inbox-send-error" role="status"><p>{messageSendError}</p>{unknownDeliveryPending && <Button type="button" disabled={sendingMessage} onClick={() => { setMessageKey(crypto.randomUUID()); setUnknownDeliveryPending(false); setMessageSendError('') }}>{t('inboxRetry.prepareResend')}</Button>}</div>}
            <div><small>{contactMode ? '' : `${messageDraft.length}/4096`}</small><Button type="submit" disabled={(composerMode === INBOX_COMPOSER_MODE.reply ? !canSend : !canAddNote) || sendingMessage || unknownDeliveryPending || (!contactMode && !messageDraft.trim() && !mediaDraft) || (contactMode && (!contactDraft.fullName.trim() || !contactDraft.phoneNumber.trim())) || (mediaDraft?.type.startsWith(INBOX_AUDIO_MIME_PREFIX) && Boolean(messageDraft.trim()))}>{sendingMessage ? t('inbox.sending') : t(composerMode === INBOX_COMPOSER_MODE.note ? 'inboxComposer.addNote' : 'inbox.send')}</Button></div>
          </form>
          <footer className="inbox-readonly-note">{t('inbox.readOnly')}</footer>
        </>}
      </section>

      <aside ref={conversationQueueRef} className="inbox-conversations" aria-label={t('inbox.conversationList')}>
        <div className="inbox-conversation-list-heading"><div><h3>{t('inbox.recentConversations')}</h3><span>{t('inbox.conversationCount', { count: conversationTotal })}</span></div><MessageSquareText size={17} /></div>
        <div className="inbox-quick-views" role="group" aria-label={t('inboxQuickViews.label')}>
          {(['all', 'mine', 'unassigned', 'unread'] as const).map((view) => <Button key={view} type="button" className={quickView === view ? 'selected' : ''} aria-pressed={quickView === view} disabled={view === 'mine' && !currentUserId} onClick={() => applyQuickView(view)}>{t(`inboxQuickViews.${view}`)}</Button>)}
        </div>
        <div className="inbox-conversation-filters"><label className="inbox-channel-filter">{t('inbox.searchConversations')}<TextField value={conversationSearch} onChange={(event) => { setConversationSearch(event.target.value); setOffset(0) }} maxLength={120} placeholder={t('inbox.searchPlaceholder')} /></label><IconButton className="inbox-filter-toggle" label={t(filtersOpen ? 'inbox.hideFilters' : 'inbox.showFilters')} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={15} /></IconButton>
          {filtersOpen && <div className="inbox-advanced-filters"><label className="inbox-channel-filter">{t('businessLines.title')}<SelectField value={businessLineFilter} onChange={(event) => { const nextLineId = event.target.value; setBusinessLineFilter(nextLineId); setChannelFilter(''); setOffset(0); setSearchParams((current) => { const next = new URLSearchParams(current); if (nextLineId) next.set('businessLineId', nextLineId); else next.delete('businessLineId'); return next }) }}><option value="">{t('businessLines.allLines')}</option>{businessLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('inbox.filterStatus')}<SelectField value={statusFilter} onChange={(event) => { setStatusFilter((['open','pending','resolved','snoozed'] as const).find((status) => status === event.target.value) ?? ''); setOffset(0) }}><option value="">{t('inbox.allStatuses')}</option>{(['open','pending','resolved','snoozed'] as const).map((status) => <option key={status} value={status}>{t(`inbox.status.${status}`)}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('inbox.filterOwner')}<SelectField value={ownerFilter} onChange={(event) => { setOwnerFilter(event.target.value); setOffset(0) }}><option value="">{t('inbox.allOwners')}</option><option value="unassigned">{t('inbox.unassigned')}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('channels.inboxFilter')}<SelectField value={channelFilter} onChange={(event) => { setChannelFilter(event.target.value); setOffset(0) }} disabled={sendingMessage}><option value="">{t('channels.allInboxChannels')}</option>{channels.filter((channel) => !businessLineFilter || channel.businessLineId === businessLineFilter).map((channel) => <option key={channel.id} value={channel.id}>{channel.displayName} · {channel.phoneNumber}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('inboxComposer.tagFilter')}<SelectField value={tagFilter} onChange={(event) => { setTagFilter(event.target.value); setOffset(0) }} disabled={sendingMessage}><option value="">{t('inboxComposer.allTags')}</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</SelectField></label>
            {conversationIdFilter && <Button type="button" onClick={clearConversationFilters}>{t('inbox.clearConversationFilters')}</Button>}
          </div>}
          <label className="inbox-unread-filter"><CheckboxField checked={unreadOnly} onChange={(event) => { setUnreadOnly(event.target.checked); setOffset(0) }} />{t('inbox.unreadOnly')}</label>
        </div>
        <div className="inbox-conversation-items">
        {loading && conversations.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
        {error && conversations.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')}><Button type="button" onClick={() => void refresh()}>{t('platform.retry')}</Button></WorkspaceState>}
        {loading && conversations.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : conversations.length === 0 ? error ? <WorkspaceState kind="error" compact message={error}><Button type="button" onClick={() => void refresh()}>{t('platform.retry')}</Button></WorkspaceState> : <WorkspaceState kind="empty" compact message={hasConversationFilters ? t('inbox.noMatchingConversations') : t('inbox.empty')} detail={hasConversationFilters ? t('inbox.noMatchesHint') : t('inbox.emptyHint')}>{hasConversationFilters && <Button type="button" onClick={clearConversationFilters}>{t('inbox.clearConversationFilters')}</Button>}</WorkspaceState> : conversations.map((conversation) => {
          const label = conversation.conversationType === 'group' ? conversation.displayName ?? t('inbox.groupConversation') : conversation.personName ?? conversation.accountName ?? t('inbox.unknownContact')
          return <Button key={conversation.id} className={`inbox-conversation ${conversation.id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(conversation.id); if (window.matchMedia('(max-width: 760px)').matches) conversationThreadRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) }} aria-pressed={conversation.id === selectedId} disabled={sendingMessage}>
            <span className="inbox-avatar"><MessageSquareText size={17} /></span><span className="inbox-conversation-copy"><strong>{label}</strong><small>{conversation.conversationType === 'group' ? t('inbox.groupConversation') : conversation.personPhone ?? '—'}</small></span>{conversation.unread && <span className="inbox-unread-indicator" aria-label={t('inbox.unread')} />}
          </Button>
        })}
        </div>
        <div className="inbox-list-pagination"><div className="inbox-pagination-summary"><span>{conversationTotal === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, conversationTotal)} / {conversationTotal}</span><label>{t('table.rowsPerPage')}<SelectField value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></SelectField></label></div><div className="inbox-pagination-controls"><Button type="button" aria-label={t('table.previous')} disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}><ChevronLeft size={16} aria-hidden="true" /></Button><Button type="button" aria-label={t('table.next')} disabled={loading || offset + pageSize >= conversationTotal} onClick={() => setOffset(offset + pageSize)}><ChevronRight size={16} aria-hidden="true" /></Button></div></div>
      </aside>


    </div>
    <Modal open={reconcileOpen} onOpenChange={setReconcileOpen} title={t('inbox.contactReconciliation.title')} description={t('inbox.contactReconciliation.description')} closeLabel={t('common.close')}>
      <form className="inbox-contact-reconcile-form" onSubmit={saveContactReconciliation}>
        <label>{t('inbox.contactReconciliation.lead')}<TextField value={leadSearch} onChange={(event) => { setLeadSearch(event.target.value); setReconcileLeadId(''); setReconcileLead(null) }} maxLength={120} placeholder={t('inbox.contactReconciliation.search')} /></label>
        {leadSearchLoading && <small role="status">{t('inbox.contactReconciliation.searching')}</small>}
        {leadSearchFailed && <WorkspaceState kind="error" compact message={t('inbox.contactReconciliation.searchFailed')} />}
        {!leadSearchLoading && !leadSearchFailed && leadSearch.trim().length >= 2 && leadOptions.length === 0 && <WorkspaceState kind="empty" compact message={t('inbox.contactReconciliation.noResults')} />}
        {leadOptions.length > 0 && <div className="inbox-contact-reconcile-options" role="group" aria-label={t('inbox.contactReconciliation.results')}>{leadOptions.map((lead) => <Button key={lead.id} type="button" className={reconcileLeadId === lead.id ? 'active' : ''} aria-pressed={reconcileLeadId === lead.id} onClick={() => { setReconcileLeadId(lead.id); setReconcileLead(lead) }}>{lead.accountName} · {lead.contactName ?? t('inbox.unknownContact')}</Button>)}</div>}
        {reconcileLead && <p className="inbox-contact-reconcile-selected"><strong>{t('inbox.contactReconciliation.selectedLead')}:</strong> {reconcileLead.accountName} · {reconcileLead.contactName ?? t('inbox.unknownContact')}</p>}
        <label>{t('inbox.contactReconciliation.name')}<TextField value={confirmedName} onChange={(event) => setConfirmedName(event.target.value)} maxLength={160} /></label>
        <label>{t('inbox.contactReconciliation.phone')}<TextField value={confirmedPhone} onChange={(event) => setConfirmedPhone(event.target.value)} maxLength={40} placeholder="+55 11 99999-0000" /></label>
        <div className="inbox-contact-reconcile-flags"><label><CheckboxField checked={markAsPrimary} onChange={(event) => setMarkAsPrimary(event.target.checked)} />{t('inbox.contactReconciliation.markPrimary')}</label><label><CheckboxField checked={markAsInterested} onChange={(event) => setMarkAsInterested(event.target.checked)} />{t('inbox.contactReconciliation.markInterested')}</label></div>
        {reconcileError && <WorkspaceState kind="error" compact message={reconcileError} />}
        <Button type="submit" disabled={reconciling || !reconcileLeadId || confirmedName.trim().length < 2}>{reconciling ? t('common.saving') : t('inbox.contactReconciliation.save')}</Button>
      </form>
    </Modal>
    <Modal open={assistantConsultOpen} onOpenChange={setAssistantConsultOpen} title={t('inboxComposer.assistantConsult.title')} description={t('inboxComposer.assistantConsult.description')} closeLabel={t('common.close')} className="inbox-assistant-consult-modal">
      <form className="inbox-contact-reconcile-form" onSubmit={consultAssistant}>
        <div className="inbox-composer-modes" role="group" aria-label={t('inboxComposer.assistantConsult.modes')}>
          <Button type="button" className={assistantConsultMode === ASSISTANT_CONVERSATION_ASSIST_MODE.summary ? 'active' : ''} aria-pressed={assistantConsultMode === ASSISTANT_CONVERSATION_ASSIST_MODE.summary} disabled={assistantConsultLoading} onClick={() => { setAssistantConsultMode(ASSISTANT_CONVERSATION_ASSIST_MODE.summary); setAssistantQuestionValidationAttempted(false); setAssistantConsultResult(null); setAssistantConsultError(false) }}>{t('inboxComposer.assistantConsult.summarize')}</Button>
          <Button type="button" className={assistantConsultMode === ASSISTANT_CONVERSATION_ASSIST_MODE.question ? 'active' : ''} aria-pressed={assistantConsultMode === ASSISTANT_CONVERSATION_ASSIST_MODE.question} disabled={assistantConsultLoading} onClick={() => { setAssistantConsultMode(ASSISTANT_CONVERSATION_ASSIST_MODE.question); setAssistantConsultResult(null); setAssistantConsultError(false) }}>{t('inboxComposer.assistantConsult.ask')}</Button>
        </div>
        {assistantConsultMode === ASSISTANT_CONVERSATION_ASSIST_MODE.question && <label>{t('inboxComposer.assistantConsult.question')}<TextareaField value={assistantQuestion} onChange={(event) => { setAssistantQuestion(event.target.value); setAssistantConsultError(false) }} maxLength={ASSISTANT_CONVERSATION_ASSIST_MAX_QUESTION_LENGTH} hint={t('inboxComposer.assistantConsult.questionHint', { count: ASSISTANT_CONVERSATION_ASSIST_MAX_QUESTION_LENGTH })} error={assistantQuestionValidationAttempted && !assistantQuestion.trim() ? t('inboxComposer.assistantConsult.questionRequired') : undefined} /></label>}
        {assistantConsultError && <WorkspaceState kind="error" compact message={t('inboxComposer.assistantConsult.failed')} />}
        {assistantConsultResult && <section className="inbox-assistant-consult-result" aria-live="polite"><h3>{t(assistantConsultMode === ASSISTANT_CONVERSATION_ASSIST_MODE.summary ? 'inboxComposer.assistantConsult.summaryResult' : 'inboxComposer.assistantConsult.answerResult')}</h3><p>{assistantConsultResult.answerText}</p><div><strong>{t('inboxComposer.assistantConsult.confirmed')}</strong>{assistantConsultResult.confirmedFacts.length ? <ul>{assistantConsultResult.confirmedFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul> : <p>{t('inboxComposer.assistantConsult.none')}</p>}</div><div><strong>{t('inboxComposer.assistantConsult.unknowns')}</strong>{assistantConsultResult.unknowns.length ? <ul>{assistantConsultResult.unknowns.map((item) => <li key={item}>{item}</li>)}</ul> : <p>{t('inboxComposer.assistantConsult.none')}</p>}</div><div><strong>{t('inboxComposer.assistantConsult.nextStep')}</strong><p>{assistantConsultResult.nextStep}</p></div></section>}
        <Button type="submit" disabled={!canSend || assistantConsultLoading}>{assistantConsultLoading ? t('inboxComposer.assistantConsult.loading') : t('inboxComposer.assistantConsult.run')}</Button>
      </form>
    </Modal>
  </section>
}
