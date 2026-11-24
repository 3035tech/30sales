import { Button, CheckboxField, IconButton, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Building2, CalendarClock, Check, CheckCheck, ChevronLeft, ChevronRight, ClipboardList, Clock3, Download, Mail, MessageSquareText, Mic, Paperclip, Pause, Phone, Play, RefreshCw, Reply, SlidersHorizontal, SmilePlus, Sparkles, Square, UserRound, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, INBOX_CONTACT_ERROR_CODE, INBOX_MEDIA_ERROR_CODE, INBOX_SEND_ERROR_CODE, type BusinessLineDto, type ChannelDto, type ConversationDto, type MessageAttachmentDto, type MessageDto } from '../lib/api'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import i18n from '../lib/i18n'
import { ASSISTANT_CONVERSATION_ASSIST_MAX_QUESTION_LENGTH, ASSISTANT_CONVERSATION_ASSIST_MODE } from '../lib/agentConstants'
import { INBOX_ATTACHMENT_ACCEPT, INBOX_AUDIO_MIME_PREFIX, INBOX_AUDIO_PLAYER, INBOX_AUDIO_RECORDING, INBOX_COMPOSER_MODE, INBOX_COMPOSER_MODES, INBOX_DELIVERY_STATE } from '../lib/inboxConstants'
import { z } from 'zod'
import './InboxWorkspace.css'
import './InboxAttachments.css'

const INBOX_MEDIA_LIMIT_BYTES = 16 * 1024 * 1024
const INBOX_QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const
const inboxStreamUpdateSchema = z.object({ conversationId: z.string().uuid() }).passthrough()
const inboxPresenceEventSchema = z.object({ conversationId: z.string().uuid(), state: z.enum(['composing', 'recording', 'paused', 'available', 'unavailable']) }).passthrough()
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

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < INBOX_AUDIO_PLAYER.minimumSeconds) return INBOX_AUDIO_PLAYER.emptyTime
  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / INBOX_AUDIO_PLAYER.secondsPerHour)
  const minutes = Math.floor(totalSeconds / INBOX_AUDIO_PLAYER.secondsPerMinute) % INBOX_AUDIO_PLAYER.secondsPerMinute
  const remainingSeconds = totalSeconds % INBOX_AUDIO_PLAYER.secondsPerMinute
  const formattedMinutes = hours > INBOX_AUDIO_PLAYER.minimumSeconds ? minutes.toString().padStart(INBOX_AUDIO_PLAYER.timeDigits, '0') : minutes.toString()
  const formattedSeconds = remainingSeconds.toString().padStart(INBOX_AUDIO_PLAYER.timeDigits, '0')
  return hours > INBOX_AUDIO_PLAYER.minimumSeconds ? `${hours}:${formattedMinutes}:${formattedSeconds}` : `${formattedMinutes}:${formattedSeconds}`
}

function InboxAudioPlayer({ src, file, label, compact = false }: {
  src?: string
  file?: Blob
  label: string
  compact?: boolean
}) {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const waveformRequestRef = useRef(0)
  const [fileSrc, setFileSrc] = useState('')
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)
  const [playbackBlocked, setPlaybackBlocked] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [waveform, setWaveform] = useState<number[]>([])

  useEffect(() => {
    if (!file) { setFileSrc(''); return }
    const url = URL.createObjectURL(file)
    setFileSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const audioSrc = src ?? fileSrc
  const waveformBars = compact ? INBOX_AUDIO_PLAYER.compactBars : INBOX_AUDIO_PLAYER.bars
  useEffect(() => {
    waveformRequestRef.current += 1
    setPlaying(false)
    setFailed(false)
    setPlaybackBlocked(false)
    setDuration(0)
    setCurrentTime(0)
    setWaveform([])
  }, [audioSrc])

  const loadWaveform = async () => {
    const audio = audioRef.current
    if (!audio || !audioSrc || !Number.isFinite(audio.duration) || audio.duration <= 0) return
    const requestId = waveformRequestRef.current
    setDuration(audio.duration)
    // Decoding long recordings can allocate hundreds of megabytes. Keep playback
    // available for them and only build the detailed waveform for short clips.
    if (audio.duration > INBOX_AUDIO_PLAYER.maxWaveformDurationSeconds) return
    let context: AudioContext | null = null
    try {
      const response = await fetch(audioSrc)
      if (!response.ok) return
      const bytes = await response.arrayBuffer()
      context = new AudioContext()
      const decoded = await context.decodeAudioData(bytes)
      const channel = decoded.getChannelData(0)
      const samplesPerBar = Math.max(INBOX_AUDIO_PLAYER.minimumSampleCount, Math.floor(channel.length / waveformBars))
      const levels = Array.from({ length: waveformBars }, (_, index) => {
        const start = index * samplesPerBar
        const end = Math.min(channel.length, start + samplesPerBar)
        let peak = 0
        for (let sample = start; sample < end; sample += 1) peak = Math.max(peak, Math.abs(channel[sample] ?? 0))
        return Math.max(INBOX_AUDIO_PLAYER.minBarHeightPercent, Math.min(INBOX_AUDIO_PLAYER.maxBarHeightPercent, Math.round(peak * INBOX_AUDIO_PLAYER.maxBarHeightPercent)))
      })
      if (waveformRequestRef.current === requestId) setWaveform(levels)
    } catch {
      // The native audio element remains usable if waveform decoding is unsupported.
    } finally {
      if (context) void context.close()
    }
  }

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      try { await audio.play(); setPlaying(true); setPlaybackBlocked(false) } catch { setPlaybackBlocked(true) }
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  const seek = (value: string) => {
    const nextTime = Number(value)
    if (audioRef.current && Number.isFinite(nextTime)) {
      try { audioRef.current.currentTime = nextTime } catch { return }
    }
    setCurrentTime(nextTime)
  }

  return <div className={`inbox-audio-player${compact ? ' is-compact' : ''}`} role="group" aria-label={label}>
    <audio ref={audioRef} src={audioSrc || undefined} preload="metadata" onLoadedMetadata={() => void loadWaveform()} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onError={() => setFailed(true)} />
    <Button type="button" className="inbox-audio-play" onClick={() => void togglePlayback()} disabled={!audioSrc || failed} aria-label={playing ? t('inbox.audioPause') : t('inbox.audioPlay')}>
      {playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
    </Button>
    <div className="inbox-audio-track">
      <div className="inbox-audio-waveform" aria-hidden="true" style={{ '--audio-progress': `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}>
        {waveform.length ? waveform.map((height, index) => <span key={index} className={duration > 0 && index / waveformBars < currentTime / duration ? 'played' : ''} style={{ height: `${height}%` }} />) : <span className="inbox-audio-waveform-placeholder" />}
      </div>
      <input type="range" min={INBOX_AUDIO_PLAYER.minimumSeconds} max={duration || INBOX_AUDIO_PLAYER.fallbackSeekMaximumSeconds} step={INBOX_AUDIO_PLAYER.seekStepSeconds} value={Math.min(currentTime, duration || INBOX_AUDIO_PLAYER.minimumSeconds)} onChange={(event) => seek(event.currentTarget.value)} aria-label={t('inbox.audioSeek')} aria-valuetext={t('inbox.audioPosition', { current: formatAudioTime(currentTime), duration: formatAudioTime(duration) })} disabled={!audioSrc || failed || duration <= INBOX_AUDIO_PLAYER.minimumSeconds} style={{ '--audio-progress': `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties} />
      <div className="inbox-audio-time"><span>{formatAudioTime(currentTime)}</span><span>{formatAudioTime(duration)}</span></div>
    </div>
    {(failed || playbackBlocked) && <small className="inbox-audio-error">{t('inbox.audioUnavailable')}</small>}
  </div>
}

function InboxMediaAttachment({ attachment, label, load, onOpen, onDownload }: {
  attachment: MessageAttachmentDto
  label: string
  load: (attachment: MessageAttachmentDto) => Promise<Blob>
  onOpen: (attachment: MessageAttachmentDto) => void
  onDownload: (attachment: MessageAttachmentDto) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const node = containerRef.current
    if (!node || src || failed || attachment.status !== 'available') return
    let cancelled = false
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      void load(attachment).then((blob) => {
        if (!cancelled) setSrc(URL.createObjectURL(blob))
      }).catch(() => { if (!cancelled) setFailed(true) })
    }, { rootMargin: '240px' })
    observer.observe(node)
    return () => { cancelled = true; observer.disconnect() }
  }, [attachment, failed, load, src])
  useEffect(() => () => { if (src) URL.revokeObjectURL(src) }, [src])
  return <div className="inbox-inline-image" ref={containerRef}>
    {src && attachment.mediaType === 'image' ? <button type="button" className="inbox-inline-image-preview" onClick={() => onOpen(attachment)} aria-label={label}><img src={src} alt={attachment.fileName ?? label} loading="lazy" /></button>
      : src && attachment.mediaType === 'video' ? <video className="inbox-inline-video" src={src} controls preload="metadata" aria-label={attachment.fileName ?? label} />
      : src && attachment.mediaType === 'audio' ? <InboxAudioPlayer src={src} label={attachment.fileName ?? label} />
      : <span className="inbox-inline-image-placeholder">{failed ? label : attachment.fileName ?? label}</span>}
    <div className="inbox-inline-image-tools"><span>{attachment.fileName ?? label}</span><IconButton label={label} onClick={() => onDownload(attachment)}><Download size={14} aria-hidden="true" /></IconButton></div>
  </div>
}

export function InboxWorkspace({ initialSearch = '', initialConversationId = '' }: { initialSearch?: string; initialConversationId?: string }) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const globalBusinessLineId = searchParams.get('businessLineId') ?? ''
  const [conversations, setConversations] = useState<ConversationDto[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [groupParticipants, setGroupParticipants] = useState<Awaited<ReturnType<typeof api.inbox.groupParticipants>> | null>(null)
  const [groupParticipantsLoading, setGroupParticipantsLoading] = useState(false)
  const [groupParticipantsFailed, setGroupParticipantsFailed] = useState(false)
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; mimeType: string; name: string } | null>(null)
  const [retryingAttachmentId, setRetryingAttachmentId] = useState('')
  const [attachmentRetryFailedId, setAttachmentRetryFailedId] = useState('')
  const [presenceState, setPresenceState] = useState<'composing' | 'recording' | null>(null)
  const presenceTimerRef = useRef<number | null>(null)
  useEffect(() => {
    setPresenceState(null)
    if (presenceTimerRef.current !== null) window.clearTimeout(presenceTimerRef.current)
    presenceTimerRef.current = null
  }, [selectedId])
  useEffect(() => setReplyTarget(null), [selectedId])
  useEffect(() => () => {
    audioCancelRequestedRef.current = true
    if (audioRecorderRef.current?.state === 'recording') audioRecorderRef.current.stop()
    audioStreamRef.current?.getTracks().forEach((track) => track.stop())
    if (audioAnimationRef.current !== null) window.cancelAnimationFrame(audioAnimationRef.current)
    if (audioContextRef.current) void audioContextRef.current.close()
  }, [selectedId])
  useEffect(() => () => { if (attachmentPreview) URL.revokeObjectURL(attachmentPreview.url) }, [attachmentPreview])
  const [messages, setMessages] = useState<MessageDto[]>([])
  const [messagesConversationId, setMessagesConversationId] = useState('')
  const [messageSearchDraft, setMessageSearchDraft] = useState('')
  const [messageSearch, setMessageSearch] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [replyTarget, setReplyTarget] = useState<MessageDto | null>(null)
  const [reactionBusyMessageId, setReactionBusyMessageId] = useState('')
  const [mediaDraft, setMediaDraft] = useState<File | null>(null)
  const [audioRecording, setAudioRecording] = useState(false)
  const [audioRecordingDuration, setAudioRecordingDuration] = useState(0)
  const [audioRecordingWaveform, setAudioRecordingWaveform] = useState<number[]>([])
  const [contactMode, setContactMode] = useState(false)
  const [contactDraft, setContactDraft] = useState({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' })
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioBytesRecordedRef = useRef(0)
  const audioRecordingTooLargeRef = useRef(false)
  const audioAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioAnimationRef = useRef<number | null>(null)
  const audioStartTimeRef = useRef(0)
  const audioCancelRequestedRef = useRef(false)
  const conversationQueueRef = useRef<HTMLElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const [olderMessagesAvailable, setOlderMessagesAvailable] = useState(false)
  const [olderMessagesOffset, setOlderMessagesOffset] = useState(100)
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false)
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

  useEffect(() => {
    if (messagesConversationId !== selectedId || messages.length === 0) return
    const container = messagesContainerRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [messagesConversationId, selectedId])

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
  useEffect(() => { setMessageDraft(''); setMessageSearchDraft(''); setMessageSearch(''); setMediaDraft(null); setContactMode(false); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }); setMessageKey(crypto.randomUUID()); setMessageSendError(''); setUnknownDeliveryPending(false); setComposerMode(INBOX_COMPOSER_MODE.reply) }, [selectedId])
  useEffect(() => {
    if (!selectedId) { setMessages([]); setMessagesConversationId(''); return }
    let active = true
    let requestInFlight = false
    setMessages([])
    setMessagesConversationId('')
    setOlderMessagesAvailable(false)
    setOlderMessagesOffset(100)
    setMessagesLoadError(false)
    setMessagesLoading(true)
    const loadMessages = async (initial = false) => {
      if (requestInFlight) return
      requestInFlight = true
      try {
        const result = await api.inbox.messages(selectedId, { limit: 100, search: messageSearch })
        if (active) {
          setMessagesLoadError(false)
          setOlderMessagesAvailable(result.length === 100)
          setMessages((current) => current.length === result.length && current.every((message, index) => {
            const next = result[index]
            return message.id === next?.id && message.deliveryState === next.deliveryState && message.bodyText === next.bodyText && message.transcriptText === next.transcriptText && message.isDeleted === next.isDeleted && JSON.stringify(message.providerMetadata) === JSON.stringify(next.providerMetadata) && JSON.stringify(message.attachments) === JSON.stringify(next.attachments)
          }) ? current : [...new Map([...current, ...result].map((message) => [message.id, message])).values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id)))
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
  }, [selectedId, messageSearch, t])
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
      stream.addEventListener('conversation.presence', (event) => {
        try {
          if (!(event instanceof MessageEvent) || typeof event.data !== 'string') return
          const parsed: unknown = JSON.parse(event.data)
          const presence = inboxPresenceEventSchema.safeParse(parsed)
          if (!presence.success || presence.data.conversationId !== selectedIdRef.current) return
          if (presenceTimerRef.current !== null) window.clearTimeout(presenceTimerRef.current)
          const nextState = presence.data.state === 'composing' || presence.data.state === 'recording' ? presence.data.state : null
          setPresenceState(nextState)
          if (nextState) presenceTimerRef.current = window.setTimeout(() => setPresenceState(null), 10000)
        } catch { /* Ignore malformed transient presence data. */ }
      })
      stream.addEventListener('error', startFallbackRefresh)
    }).catch(startFallbackRefresh)
    return () => {
      active = false
      stream?.close()
      stopFallbackRefresh()
      if (presenceTimerRef.current !== null) window.clearTimeout(presenceTimerRef.current)
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
      setConversations((current) => current.map((conversation) => conversation.id === selectedId ? { ...conversation, unread: false } : conversation))
      if (selectedIdRef.current === selectedId) {
        if (unreadOnly) skipUnreadAutoSelect.current = true
        void refreshRef.current(true)
      }
    }).catch(() => { readCursorKey.current = '' })
  }, [messages, messagesConversationId, selectedId, unreadOnly, refresh])

  const selected = conversations.find((conversation) => conversation.id === selectedId)
  useEffect(() => {
    let active = true
    setGroupParticipants(null)
    setGroupParticipantsFailed(false)
    if (!selected || selected.conversationType !== 'group') { setGroupParticipantsLoading(false); return () => { active = false } }
    setGroupParticipantsLoading(true)
    void api.inbox.groupParticipants(selected.id).then((result) => { if (active) setGroupParticipants(result) }).catch(() => { if (active) setGroupParticipantsFailed(true) }).finally(() => { if (active) setGroupParticipantsLoading(false) })
    return () => { active = false }
  }, [selected?.id, selected?.conversationType])
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
          : await api.inbox.sendMessage(selected.id, { bodyText: messageDraft, idempotencyKey: messageKey, ...(replyTarget ? { targetMessageId: replyTarget.id } : {}) })
        : await api.inbox.addNote(selected.id, { bodyText: messageDraft, idempotencyKey: messageKey })
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
      if (composerMode === INBOX_COMPOSER_MODE.reply && message.deliveryState === INBOX_DELIVERY_STATE.unknown) {
        setUnknownDeliveryPending(true)
        setMessageSendError(t('inboxRetry.deliveryUnknown'))
      } else {
        setMessageDraft(''); setReplyTarget(null); setMediaDraft(null); setContactMode(false); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }); setMessageKey(crypto.randomUUID())
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
  const sendReaction = async (target: MessageDto, emoji: string) => {
    if (!selected || !canSend || !target.externalMessageId || reactionBusyMessageId) return
    setReactionBusyMessageId(target.id)
    try {
      const reaction = await api.inbox.sendMessage(selected.id, { bodyText: emoji, idempotencyKey: crypto.randomUUID(), targetMessageId: target.id, mode: 'reaction' })
      setMessages((current) => current.some((item) => item.id === reaction.id) ? current : [...current, reaction])
    } catch {
      setMessageSendError(t('inbox.reactionFailed'))
    } finally {
      setReactionBusyMessageId('')
    }
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
  const releaseAudioCapture = () => {
    if (audioAnimationRef.current !== null) window.cancelAnimationFrame(audioAnimationRef.current)
    audioAnimationRef.current = null
    audioAnalyserRef.current = null
    audioStreamRef.current?.getTracks().forEach((track) => track.stop())
    audioStreamRef.current = null
    if (audioContextRef.current) void audioContextRef.current.close()
    audioContextRef.current = null
    setAudioRecording(false)
  }
  const stopAudioRecording = () => {
    if (audioRecorderRef.current?.state === 'recording') audioRecorderRef.current.stop()
  }
  const startAudioRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMessageSendError(t('inboxComposer.audioRecordingUnavailable'))
      return
    }
    setMessageSendError('')
    audioCancelRequestedRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = INBOX_AUDIO_RECORDING.mimeTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate))
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      audioStreamRef.current = stream
      audioRecorderRef.current = recorder
      audioChunksRef.current = []
      audioBytesRecordedRef.current = 0
      audioRecordingTooLargeRef.current = false
      audioStartTimeRef.current = Date.now()
      setAudioRecordingDuration(0)
      setAudioRecordingWaveform(Array.from({ length: INBOX_AUDIO_PLAYER.bars }, () => INBOX_AUDIO_RECORDING.minimumWaveformHeightPercent))
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = INBOX_AUDIO_RECORDING.waveformSampleBytes
      context.createMediaStreamSource(stream).connect(analyser)
      audioContextRef.current = context
      audioAnalyserRef.current = analyser
      const sample = new Uint8Array(analyser.fftSize)
      let lastWaveformUpdate = 0
      const animateWaveform = (time: number) => {
        const activeAnalyser = audioAnalyserRef.current
        if (!activeAnalyser) return
        activeAnalyser.getByteTimeDomainData(sample)
        const amplitude = Math.sqrt(sample.reduce((sum, value) => sum + ((value - INBOX_AUDIO_RECORDING.sampleCenter) / INBOX_AUDIO_RECORDING.sampleCenter) ** 2, 0) / sample.length)
        if (time - lastWaveformUpdate >= INBOX_AUDIO_RECORDING.waveformRefreshMilliseconds) {
          lastWaveformUpdate = time
          setAudioRecordingWaveform((current) => [...current.slice(1), Math.max(INBOX_AUDIO_RECORDING.minimumWaveformHeightPercent, Math.min(INBOX_AUDIO_RECORDING.maximumWaveformHeightPercent, Math.round(amplitude * INBOX_AUDIO_RECORDING.maximumWaveformHeightPercent * INBOX_AUDIO_RECORDING.waveformAmplitudeScale)))])
          setAudioRecordingDuration((Date.now() - audioStartTimeRef.current) / INBOX_AUDIO_RECORDING.millisecondsPerSecond)
        }
        audioAnimationRef.current = window.requestAnimationFrame(animateWaveform)
      }
      audioAnimationRef.current = window.requestAnimationFrame(animateWaveform)
      recorder.ondataavailable = (event) => {
        if (event.data.size === 0) return
        audioBytesRecordedRef.current += event.data.size
        if (audioBytesRecordedRef.current > INBOX_MEDIA_LIMIT_BYTES) {
          audioRecordingTooLargeRef.current = true
          if (recorder.state === 'recording') recorder.stop()
          return
        }
        audioChunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const chunks = audioChunksRef.current
        const recordedType = recorder.mimeType.split(';', 1)[0]?.toLowerCase() ?? ''
        const extension = INBOX_AUDIO_RECORDING.mimeTypeExtensions[recordedType as keyof typeof INBOX_AUDIO_RECORDING.mimeTypeExtensions]
        if (audioRecordingTooLargeRef.current) setMessageSendError(t('inboxComposer.mediaTooLarge'))
        else if (!audioCancelRequestedRef.current && chunks.length && extension) {
          const recording = new Blob(chunks, { type: recordedType })
          const file = new File([recording], `${t('inboxComposer.voiceMessageFile')}.${extension}`, { type: recordedType })
          if (file.size <= INBOX_MEDIA_LIMIT_BYTES) {
            setMediaDraft(file)
            if (messageDraft.trim()) setMessageSendError(t('inboxComposer.audioCaptionUnsupported'))
          }
          else setMessageSendError(t('inboxComposer.mediaTooLarge'))
        } else if (!audioCancelRequestedRef.current && chunks.length) setMessageSendError(t('inboxComposer.audioRecordingUnsupported'))
        audioChunksRef.current = []
        releaseAudioCapture()
      }
      recorder.start()
      setAudioRecording(true)
    } catch {
      releaseAudioCapture()
      setMessageSendError(t('inboxComposer.audioRecordingFailed'))
    }
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
  const openAttachment = async (attachment: MessageAttachmentDto) => {
    try {
      const content = await api.inbox.downloadAttachment(attachment.id)
      const url = URL.createObjectURL(content)
      const mimeType = attachment.mimeType ?? content.type
      const name = attachment.fileName ?? t('inbox.attachmentFallback')
      if (mimeType.startsWith('image/') || mimeType === 'application/pdf' || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
        setAttachmentPreview({ url, mimeType, name })
        return
      }
      const link = document.createElement('a')
      link.href = url; link.download = name; link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError(t('inbox.attachmentDownloadFailed')) }
  }
  const loadAttachment = useCallback((attachment: MessageAttachmentDto) => api.inbox.downloadAttachment(attachment.id), [])
  const retryAttachment = async (attachment: MessageAttachmentDto) => {
    setRetryingAttachmentId(attachment.id)
    setAttachmentRetryFailedId('')
    try {
      await api.inbox.retryAttachment(attachment.id)
      refreshMessagesRef.current()
    } catch {
      setAttachmentRetryFailedId(attachment.id)
    } finally {
      setRetryingAttachmentId('')
    }
  }

  return <section className={`inbox-page${contactContextOpen ? '' : ' inbox-context-collapsed'}`}>
    <header className="inbox-heading"><div><h2>{t('inbox.title')}</h2></div>
      <Button className="refresh" disabled={sendingMessage} onClick={() => void refresh()} aria-label={t('inbox.refresh')}><RefreshCw size={16} /></Button>
    </header>
    {error && <WorkspaceState kind="error" compact message={error} />}
    <div className="inbox-layout">
      <aside id="inbox-contact-context" className="inbox-contact-panel" aria-label={t('inbox.leadDetails')}>
        {!selected ? <WorkspaceState kind="empty" compact message={t('inbox.selectConversation')} /> : <>
          <div className="inbox-contact-identity"><span><UserRound size={21} /></span><div><h3>{selected.conversationType === 'group' ? selected.displayName ?? t('inbox.groupConversation') : selected.personName ?? t('inbox.unknownContact')}</h3><p>{presenceState === 'composing' ? t('inbox.presenceTyping') : presenceState === 'recording' ? t('inbox.presenceRecording') : selected.conversationType === 'group' ? t('inbox.groupConversation') : selected.accountName ?? t('inbox.noCompany')}</p></div></div>
          {selected.conversationType === 'group' && <section className="inbox-contact-section inbox-group-participants"><h4>{t('inbox.groupParticipants')}</h4>{groupParticipantsLoading ? <p>{t('inbox.groupParticipantsLoading')}</p> : groupParticipantsFailed ? <p role="status">{t('inbox.groupParticipantsFailed')}</p> : groupParticipants?.supported ? <>{groupParticipants.stale && <p role="status">{t('inbox.groupParticipantsCached')}</p>}<ul>{groupParticipants.participants.map((participant) => <li key={participant.id}><span>{participant.name ?? participant.phone ?? participant.id}</span>{participant.isAdmin && <small>{t('inbox.groupParticipantAdmin')}</small>}</li>)}</ul></> : groupParticipants && !groupParticipants.supported ? <p>{t('inbox.groupParticipantsUnsupported')}</p> : null}</section>}
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
          <header className="inbox-thread-heading"><div><Button type="button" className="inbox-mobile-queue-nav" onClick={() => conversationQueueRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}><ArrowLeft size={15} />{t('inbox.conversationList')}</Button><strong>{selected.conversationType === 'group' ? selected.displayName ?? t('inbox.groupConversation') : selected.personName ?? selected.accountName ?? t('inbox.unknownContact')}</strong><span>{selected.conversationType === 'group' ? t('inbox.groupConversation') : selected.personPhone ?? selected.channelName ?? selected.provider}</span><small>{t('inbox.owner')}: {selected.ownerName ?? t('inbox.unassigned')} · {t('inbox.automation')}: {t(`inbox.modes.${selected.automationMode}`)}</small>{presenceState && <small>{presenceState === "composing" ? t("inbox.presenceTyping") : t("inbox.presenceRecording")}</small>}</div><div className="inbox-control-actions">
            <Button type="button" className="inbox-context-toggle" aria-controls="inbox-contact-context" aria-expanded={contactContextOpen} onClick={() => setContactContextOpen((open) => !open)}><UserRound size={15} />{t('inbox.leadDetails')}</Button>
            {(!selected.ownerUserId || selected.ownerUserId === currentUserId) && assignees.length > 0 && <><label className="inbox-assignee-select"><span>{t('inbox.assignTo')}</span><SelectField value={assigneeTarget} onChange={(event) => setAssigneeTarget(event.target.value)} disabled={controlling}><option value="" disabled>{t('inbox.selectAssignee')}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</SelectField></label><Button type="button" disabled={controlling || !assigneeTarget} onClick={() => void controlConversation('assign')}>{t('inbox.assign')}</Button></>}
            {!selected.ownerUserId && <Button type="button" disabled={controlling} onClick={() => void controlConversation('claim')}>{controlling ? t('inbox.claiming') : t('inbox.claim')}</Button>}
            {selected.ownerUserId === currentUserId && selected.automationMode === 'human' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('pause')}>{t('inbox.pauseAssistant')}</Button>}
            {selected.automationMode === 'paused' && (!selected.ownerUserId || selected.ownerUserId === currentUserId) && <Button type="button" disabled={controlling} onClick={() => void controlConversation('assistant')}>{t('inbox.resumeAssistant')}</Button>}
            {selected.ownerUserId === currentUserId && <Button type="button" disabled={controlling} onClick={() => void controlConversation('release')}>{t('inbox.release')}</Button>}
            {selected.ownerUserId === currentUserId && selected.status !== 'resolved' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('resolve')}>{t('inbox.resolve')}</Button>}
            {selected.ownerUserId === currentUserId && selected.status === 'resolved' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('reopen')}>{t('inbox.reopen')}</Button>}
            <span className="tag">{t(`inbox.status.${selected.status}`)}</span></div></header>
          <form className="inbox-message-search" onSubmit={(event) => { event.preventDefault(); setMessageSearch(messageSearchDraft.trim()) }}><label htmlFor="inbox-message-search">{t('inboxSearch.label')}</label><TextField id="inbox-message-search" value={messageSearchDraft} onChange={(event) => setMessageSearchDraft(event.target.value)} maxLength={200} placeholder={t('inboxSearch.placeholder')} /><Button type="submit" disabled={messagesLoading}>{t('inboxSearch.search')}</Button>{messageSearch && <Button type="button" onClick={() => { setMessageSearchDraft(''); setMessageSearch('') }}>{t('inboxSearch.clear')}</Button>}</form>
          <div ref={messagesContainerRef} className="inbox-messages" role="log" aria-label={t('inbox.thread')} aria-relevant="additions text" aria-atomic="false">
            {messagesLoading ? <div className="inbox-message-state"><WorkspaceState kind="loading" compact message={t('common.loading')} /></div> : messagesLoadError && messages.length === 0 ? <div className="inbox-message-state"><WorkspaceState kind="error" compact message={t('inbox.messagesFailed')}><Button type="button" onClick={() => refreshMessagesRef.current()}>{t('platform.retry')}</Button></WorkspaceState></div> : <>{messagesLoadError && <WorkspaceState kind="error" compact message={t('inbox.messagesFailed')} detail={t('table.resultsRetained')}><Button type="button" onClick={() => refreshMessagesRef.current()}>{t('platform.retry')}</Button></WorkspaceState>}{messages.length === 0 ? <div className="inbox-message-state"><WorkspaceState kind="empty" compact message={messageSearch ? t('inboxSearch.empty') : t('inbox.noMessagesYet')} detail={messageSearch ? undefined : t('inbox.emptyMessagesHint')} /></div> : <>{olderMessagesAvailable && <div className="inbox-load-older"><Button type="button" disabled={olderMessagesLoading} onClick={async () => { const beforeHeight = messagesContainerRef.current?.scrollHeight ?? 0; setOlderMessagesLoading(true); try { const older = await api.inbox.messages(selected.id, { limit: 100, offset: olderMessagesOffset, search: messageSearch }); setMessages((current) => [...new Map([...older, ...current].map((message) => [message.id, message])).values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))); setOlderMessagesAvailable(older.length === 100); setOlderMessagesOffset((current) => current + older.length); requestAnimationFrame(() => { const node = messagesContainerRef.current; if (node) node.scrollTop += node.scrollHeight - beforeHeight }) } catch { setMessagesLoadError(true) } finally { setOlderMessagesLoading(false) } }}>{olderMessagesLoading ? t('inbox.loadingOlderMessages') : t('inbox.loadOlderMessages')}</Button></div>}{messages.map((message) => <article key={message.id} className={`inbox-message ${message.direction}`}>
              <div className="inbox-message-meta"><span>{message.direction === 'internal' ? t('inboxComposer.internalNoteBy', { name: message.actorName ?? t('inbox.actor.user') }) : message.providerMetadata?.evolution?.source === 'provider_echo' ? t('inbox.actor.whatsappApp') : t(`inbox.actor.${message.actorType}`)}</span><time dateTime={message.occurredAt}>{formatDate(message.occurredAt)}</time></div>
              {message.isDeleted ? <p className="inbox-message-deleted">{t('inbox.messageDeleted')}</p> : <>{selected.conversationType === 'group' && message.direction === 'inbound' && message.providerMetadata?.evolution?.author?.name && <small className="inbox-group-author">{message.providerMetadata.evolution.author.name}</small>}{message.providerMetadata?.evolution?.quotedMessage?.bodyText && <blockquote className="inbox-message-quote">{message.providerMetadata.evolution.quotedMessage.bodyText}</blockquote>}{message.providerMetadata?.evolution?.reaction && <small>{t('inbox.reactionSent', { emoji: message.providerMetadata.evolution.reaction.emoji })}</small>}{message.providerMetadata?.evolution?.richContent?.kind === 'card' ? <div className="inbox-rich-card">{message.attachments.filter((attachment) => attachment.mediaType === 'image').map((attachment) => <InboxMediaAttachment key={attachment.id} attachment={attachment} label={t('inbox.attachmentPreview')} load={loadAttachment} onOpen={(item) => void openAttachment(item)} onDownload={(item) => void openAttachment(item)} />)}{message.providerMetadata.evolution.richContent.title && <strong>{message.providerMetadata.evolution.richContent.title}</strong>}{message.providerMetadata.evolution.richContent.body && <p>{message.providerMetadata.evolution.richContent.body}</p>}{message.providerMetadata.evolution.richContent.buttonUrl && /^https?:\/\//i.test(message.providerMetadata.evolution.richContent.buttonUrl) && <a className="inbox-rich-card-action" href={message.providerMetadata.evolution.richContent.buttonUrl} target="_blank" rel="noopener noreferrer">{message.providerMetadata.evolution.richContent.buttonLabel ?? t('inbox.openLink')}</a>}</div> : message.bodyText ? <InboxMessageBody text={message.bodyText} /> : !message.transcriptText && message.attachments.length === 0 && message.providerMetadata?.evolution?.richContent?.kind !== 'poll' && <p>{message.providerMetadata?.evolution?.unsupportedType ? t('inbox.unsupportedMessageType', { type: message.providerMetadata.evolution.unsupportedType }) : t('inbox.nonTextMessage')}</p>}{message.providerMetadata?.evolution?.richContent?.kind === 'poll' && <div className="inbox-poll"><strong>{t('inbox.pollOptions')}</strong><ul>{message.providerMetadata.evolution.richContent.options.map((option, index) => <li key={`${index}:${option}`}>{option}</li>)}</ul></div>}{message.transcriptText && <p className="inbox-transcript"><strong>{t('inbox.transcript')}</strong> {message.transcriptText}</p>}{message.attachments.map((attachment) => message.providerMetadata?.evolution?.richContent?.kind === 'card' && attachment.mediaType === 'image' ? null : attachment.status === 'available' && ['image', 'video', 'audio'].includes(attachment.mediaType) ? <InboxMediaAttachment key={attachment.id} attachment={attachment} label={t('inbox.attachmentPreview')} load={loadAttachment} onOpen={(item) => void openAttachment(item)} onDownload={(item) => void openAttachment(item)} /> : <div className="inbox-attachment" key={attachment.id}><Paperclip size={14} /><span>{attachment.fileName ?? t(`inbox.mediaTypes.${attachment.mediaType}`)}<small>{attachmentRetryFailedId === attachment.id ? t('inbox.attachmentRetryFailed') : attachment.status === 'available' ? attachment.mimeType ?? t('inbox.attachmentReady') : t(`inbox.attachmentStatus.${attachment.status}`)}</small></span>{attachment.status === 'available' && <IconButton label={t('inbox.downloadAttachment', { name: attachment.fileName ?? t(`inbox.mediaTypes.${attachment.mediaType}`) })} onClick={() => void openAttachment(attachment)}><Download size={14} aria-hidden="true" /></IconButton>}{attachment.status === 'failed' && <IconButton className={retryingAttachmentId === attachment.id ? 'is-loading' : ''} label={retryingAttachmentId === attachment.id ? t('inbox.retryingAttachment') : t('inbox.retryAttachment')} disabled={retryingAttachmentId === attachment.id} onClick={() => void retryAttachment(attachment)}><RefreshCw size={14} aria-hidden="true" /></IconButton>}</div>)}</>}{message.direction === 'inbound' && <small>{t(`inbox.delivery.${message.deliveryState}`)}</small>}{message.direction === 'outbound' && <div className={`inbox-outbound-status ${message.deliveryState === 'read' ? 'is-read' : ''}`} aria-label={t(`inbox.delivery.${message.deliveryState}`)}>{message.deliveryState === 'requested' ? <Clock3 size={14} /> : message.deliveryState === 'delivered' || message.deliveryState === 'read' ? <CheckCheck size={15} /> : <Check size={15} />}</div>}
              {canSend && message.externalMessageId && !message.isDeleted && message.direction !== 'internal' && <div className="inbox-message-actions">{message.bodyText && <Button type="button" onClick={() => { setComposerMode(INBOX_COMPOSER_MODE.reply); setReplyTarget(message); setMessageSendError('') }}><Reply size={14} />{t('inbox.replyToMessage')}</Button>}<details><summary aria-label={t('inbox.reactToMessage')}><SmilePlus size={15} /></summary><div role="group" aria-label={t('inbox.reactionOptions')}>{INBOX_QUICK_EMOJIS.map((emoji) => <button type="button" key={emoji} disabled={reactionBusyMessageId === message.id} aria-label={t('inbox.sendReaction', { emoji })} onClick={() => void sendReaction(message, emoji)}>{emoji}</button>)}</div></details></div>}
            </article>)}</>}</>}
          </div>
          <form className="inbox-composer" onSubmit={sendMessage}>
            <div className="inbox-composer-modes"><Button type="button" className={composerMode === INBOX_COMPOSER_MODE.reply ? 'active' : ''} onClick={() => { setComposerMode(INBOX_COMPOSER_MODE.reply); setMessageSendError('') }} disabled={sendingMessage}>{t('inboxComposer.replyMode')}</Button><Button type="button" className={composerMode === INBOX_COMPOSER_MODE.note ? 'active' : ''} onClick={() => { setComposerMode(INBOX_COMPOSER_MODE.note); setMessageSendError('') }} disabled={sendingMessage || Boolean(mediaDraft) || contactMode}>{t('inboxComposer.noteMode')}</Button></div>
            {composerMode === INBOX_COMPOSER_MODE.reply && !canSend && <p>{t('inbox.replyUnavailable')}</p>}
            {composerMode === INBOX_COMPOSER_MODE.note && !canAddNote && <p>{t('inboxComposer.noteUnavailable')}</p>}
            {replyTarget && composerMode === INBOX_COMPOSER_MODE.reply && <div className="inbox-reply-target"><span><strong>{t('inbox.replyingTo')}</strong>{replyTarget.bodyText ?? t('inbox.nonTextMessage')}</span><IconButton label={t('inbox.cancelReply')} onClick={() => setReplyTarget(null)}><X size={14} /></IconButton></div>}
            <TextareaField value={messageDraft} onChange={(event) => { setMessageDraft(event.target.value); setMessageSendError(mediaDraft?.type.startsWith(INBOX_AUDIO_MIME_PREFIX) && event.target.value.trim() ? t('inboxComposer.audioCaptionUnsupported') : '') }} onKeyDown={(event) => { if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return; event.preventDefault(); event.currentTarget.form?.requestSubmit() }} maxLength={4096} placeholder={t(composerMode === INBOX_COMPOSER_MODE.note ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} disabled={(composerMode === INBOX_COMPOSER_MODE.reply ? !canSend : !canAddNote) || sendingMessage || contactMode} aria-label={t(composerMode === INBOX_COMPOSER_MODE.note ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} />
            {composerMode === INBOX_COMPOSER_MODE.reply && <div className="inbox-composer-tools"><input ref={attachmentInputRef} type="file" accept={INBOX_ATTACHMENT_ACCEPT} hidden onChange={selectMedia} /><Button type="button" className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || contactMode} onClick={() => void draftReplyWithAssistant()}><Sparkles size={15} />{draftingReply ? t('inboxComposer.aiDrafting') : t('inboxComposer.aiDraft')}</Button><Button type="button" className="inbox-media-action" disabled={!canSend || assistantConsultLoading || contactMode} onClick={() => { setAssistantConsultMode(ASSISTANT_CONVERSATION_ASSIST_MODE.summary); setAssistantQuestion(''); setAssistantQuestionValidationAttempted(false); setAssistantConsultResult(null); setAssistantConsultError(false); setAssistantConsultOpen(true) }}><MessageSquareText size={15} />{t('inboxComposer.aiConsult')}</Button><IconButton className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || contactMode || Boolean(mediaDraft)} onClick={() => attachmentInputRef.current?.click()} label={t('inboxComposer.attachFile')}><Paperclip size={17} aria-hidden="true" /></IconButton><IconButton className={`inbox-media-action${audioRecording ? ' is-recording' : ''}`} disabled={!canSend || sendingMessage || draftingReply || contactMode || Boolean(mediaDraft)} onClick={() => audioRecording ? stopAudioRecording() : void startAudioRecording()} aria-pressed={audioRecording} label={t(audioRecording ? 'inboxComposer.stopAudioRecording' : 'inboxComposer.sendAudio')}>{audioRecording ? <Square size={16} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}</IconButton><Button type="button" className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || Boolean(mediaDraft)} onClick={() => { setContactMode((active) => !active); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }); setMessageDraft(''); setMessageSendError('') }}><UserRound size={15} />{t(contactMode ? 'inboxComposer.cancelContact' : 'inboxComposer.attachContact')}</Button>{mediaDraft && <span className="inbox-media-selection"><span>{mediaDraft.type.startsWith(INBOX_AUDIO_MIME_PREFIX) ? <Mic size={14} /> : <Paperclip size={14} />}{mediaDraft.name}</span><small>{(mediaDraft.size / 1024 / 1024).toFixed(1)} MiB</small><IconButton label={t('inboxComposer.removeAttachment')} disabled={sendingMessage} onClick={() => { setMediaDraft(null); setMessageSendError('') }}><X size={15} /></IconButton></span>}</div>}
            {audioRecording && <div className="inbox-audio-recording" role="status" aria-label={t('inboxComposer.audioRecordingInProgress')}><span className="inbox-audio-recording-live"><i aria-hidden="true" />{t('inboxComposer.audioRecordingInProgress')}</span><div className="inbox-audio-waveform" aria-hidden="true">{audioRecordingWaveform.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div><time>{formatAudioTime(audioRecordingDuration)}</time></div>}
            {mediaDraft?.type.startsWith(INBOX_AUDIO_MIME_PREFIX) && <div className="inbox-audio-preview"><span>{t("inbox.audioPreview")}</span><InboxAudioPlayer file={mediaDraft} label={mediaDraft.name} compact /></div>}
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
          return <Button key={conversation.id} className={`inbox-conversation ${conversation.id === selectedId ? 'selected' : ''} ${conversation.unread ? 'unread' : ''}`} onClick={() => { setSelectedId(conversation.id); if (window.matchMedia('(max-width: 760px)').matches) conversationThreadRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }) }} aria-pressed={conversation.id === selectedId} disabled={sendingMessage}>
            <span className="inbox-avatar"><MessageSquareText size={17} /></span><span className="inbox-conversation-copy"><span className="inbox-conversation-topline"><strong>{label}</strong>{conversation.lastMessageAt && <time dateTime={conversation.lastMessageAt}>{new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(conversation.lastMessageAt))}</time>}</span><small>{conversation.conversationType === 'group' ? t('inbox.groupConversation') : conversation.personPhone ?? '—'}</small><span className="inbox-conversation-preview">{conversation.lastMessageDirection === 'outbound' && <span className={`inbox-list-ticks ${conversation.lastMessageDeliveryState === 'read' ? 'is-read' : ''}`} aria-label={t(`inbox.delivery.${conversation.lastMessageDeliveryState ?? 'unknown'}`)}>{conversation.lastMessageDeliveryState === 'requested' ? <Clock3 size={13} /> : conversation.lastMessageDeliveryState === 'delivered' || conversation.lastMessageDeliveryState === 'read' ? <CheckCheck size={14} /> : <Check size={14} />}</span>}{conversation.lastMessagePreview ?? t('inbox.noMessagesYet')}</span></span>{conversation.unread && <span className="inbox-unread-indicator" aria-label={t('inbox.unread')} />}
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
    <Modal open={attachmentPreview !== null} onOpenChange={(open) => { if (!open) setAttachmentPreview(null) }} title={attachmentPreview?.name ?? t('inbox.attachmentFallback')} description={t('inbox.attachmentPreview')} closeLabel={t('common.close')} className="inbox-attachment-preview-modal">
      {attachmentPreview?.mimeType.startsWith('image/') && <img src={attachmentPreview.url} alt={attachmentPreview.name} />}
      {attachmentPreview?.mimeType === 'application/pdf' && <iframe src={attachmentPreview.url} title={attachmentPreview.name} />}
      {attachmentPreview?.mimeType.startsWith('video/') && <video src={attachmentPreview.url} controls />}
      {attachmentPreview?.mimeType.startsWith('audio/') && <InboxAudioPlayer src={attachmentPreview.url} label={attachmentPreview.name} />}
      {attachmentPreview && <a href={attachmentPreview.url} download={attachmentPreview.name}>{t('inbox.download')}</a>}
    </Modal>
  </section>
}
