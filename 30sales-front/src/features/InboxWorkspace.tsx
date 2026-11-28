import { Button, CheckboxField, IconButton, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { PhoneField } from '../components/ui/PhoneField'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Building2, CalendarClock, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, CircleX, ClipboardList, Clock3, Copy, Download, Ellipsis, Mail, MessageSquareText, Mic, Paperclip, Pause, Phone, Play, RefreshCw, Reply, Send, SlidersHorizontal, Smile, SmilePlus, Sparkles, Square, UserRound, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { api, ApiError, INBOX_CONTACT_ERROR_CODE, INBOX_MEDIA_ERROR_CODE, INBOX_SEND_ERROR_CODE, type BusinessLineDto, type ChannelDto, type ConversationDto, type MessageAttachmentDto, type MessageDto } from '../lib/api'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { Modal } from '../components/ui/Modal'
import i18n from '../lib/i18n'
import { ASSISTANT_CONVERSATION_ASSIST_MAX_QUESTION_LENGTH, ASSISTANT_CONVERSATION_ASSIST_MODE } from '../lib/agentConstants'
import { INBOX_ATTACHMENT_ACCEPT, INBOX_AUDIO_MIME_PREFIX, INBOX_AUDIO_PLAYER, INBOX_AUDIO_RECORDING, INBOX_COMPOSER_MODE, INBOX_COMPOSER_MODES, INBOX_DELIVERY_STATE, INBOX_REALTIME_REFRESH_INTERVAL_MS } from '../lib/inboxConstants'
import { z } from 'zod'
import './InboxWorkspace.css'
import './InboxAttachments.css'

const INBOX_MEDIA_LIMIT_BYTES = 16 * 1024 * 1024
const INBOX_QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const
const INBOX_COMPOSER_EMOJIS = ['😀', '😃', '😄', '😁', '😊', '🙂', '😉', '😍', '🥰', '😘', '😎', '🤔', '😅', '😂', '🤣', '😭', '😮', '😢', '😡', '🙏', '👏', '👍', '👎', '🙌', '💪', '🤝', '❤️', '💙', '🔥', '🎉', '✅', '✨'] as const
const inboxStreamUpdateSchema = z.object({ conversationId: z.string().uuid() }).passthrough()
const inboxPresenceEventSchema = z.object({ conversationId: z.string().uuid(), state: z.enum(['composing', 'recording', 'paused', 'available', 'unavailable']) }).passthrough()
const messageUrlPattern = /(https?:\/\/[^\s<>"']+)/gi
const MSG_GROUP_THRESHOLD_MS = 5 * 60 * 1000
const linkPreviewCache = new Map<string, { url: string; title: string | null; description: string | null; image: string | null } | null>()

function extractFirstUrl(text: string): string | null {
  const match = /https?:\/\/[^\s<>"']+/i.exec(text)
  if (!match) return null
  return match[0].replace(/[.,!?;:)\]}>]+$/, '')
}

function getGroupClass(message: { direction: string; occurredAt: string }, prev: { direction: string; occurredAt: string } | undefined, next: { direction: string; occurredAt: string } | undefined): string {
  if (message.direction === 'internal') return ''
  const time = new Date(message.occurredAt).getTime()
  const prevGrouped = prev && prev.direction === message.direction && prev.direction !== 'internal' &&
    time - new Date(prev.occurredAt).getTime() < MSG_GROUP_THRESHOLD_MS &&
    new Date(message.occurredAt).toDateString() === new Date(prev.occurredAt).toDateString()
  const nextGrouped = next && next.direction === message.direction && next.direction !== 'internal' &&
    new Date(next.occurredAt).getTime() - time < MSG_GROUP_THRESHOLD_MS &&
    new Date(message.occurredAt).toDateString() === new Date(next.occurredAt).toDateString()
  if (prevGrouped && nextGrouped) return ' is-group-middle'
  if (prevGrouped) return ' is-group-end'
  if (nextGrouped) return ' is-group-start'
  return ''
}

function getGroupConversationName(displayName: string | null, fallback: string): string {
  const name = displayName?.trim()
  return name && !name.endsWith('@g.us') ? name : fallback
}

function InboxConversationAvatar({ conversationId, label, enabled }: { conversationId: string; label: string; enabled: boolean }) {
  const containerRef = useRef<HTMLSpanElement>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled || !containerRef.current) return
    let active = true
    let objectUrl: string | null = null
    const load = () => {
      void api.inbox.profilePicture(conversationId).then((blob) => {
        if (!active || !blob.type.startsWith('image/')) return
        objectUrl = URL.createObjectURL(blob)
        setImageUrl(objectUrl)
      }).catch(() => undefined)
    }
    if (typeof IntersectionObserver === 'undefined') load()
    else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); load() }
      }, { rootMargin: '160px' })
      observer.observe(containerRef.current)
      return () => { active = false; observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [conversationId, enabled])
  return <span ref={containerRef} className="inbox-avatar" aria-label={label}>
    {imageUrl ? <img src={imageUrl} alt="" /> : <MessageSquareText size={17} aria-hidden="true" />}
  </span>
}

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

type InboxPoll = { title: string; options: string[]; resultsStatus?: 'pending' | 'available' | 'unsupported' | 'failed' | 'unavailable'; results?: { updatedAt: string; options: Array<{ name: string; count: number; voters: Array<{ id: string; name: string | null; phone: string | null }> }> } }

function InboxPollCard({ poll }: { poll: InboxPoll }) {
  const { t } = useTranslation()
  const [votesOpen, setVotesOpen] = useState(false)
  const [visibleVoters, setVisibleVoters] = useState<Record<string, number>>({})
  const results = poll.options.map((name) => poll.results?.options.find((option) => option.name.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? { name, count: 0, voters: [] })
  const totalVotes = results.reduce((sum, option) => sum + option.count, 0)
  const voteLabel = (count: number) => count === 1 ? t('inbox.pollVote') : t('inbox.pollVotes', { count })
  const resultStatusMessage = poll.resultsStatus === 'pending'
    ? t('inbox.pollResultsPending')
    : poll.resultsStatus === 'failed'
      ? t('inbox.pollResultsFailed')
      : poll.results
        ? null
        : poll.resultsStatus === 'unsupported'
          ? t('inbox.pollResultsUnsupported')
          : t('inbox.pollResultsLegacy')
  return <div className="inbox-poll">
    <strong className="inbox-poll-title">{poll.title}</strong>
    {results.map((option) => <div className="inbox-poll-option" key={option.name}>
      <div className="inbox-poll-option-label"><span>{option.name}</span>{poll.results && <strong>{option.count}</strong>}</div>
      {poll.results && <div className="inbox-poll-track" role="meter" aria-label={`${option.name}: ${voteLabel(option.count)}`} aria-valuemin={0} aria-valuemax={Math.max(totalVotes, 1)} aria-valuenow={option.count}><span style={{ width: `${totalVotes ? Math.round(option.count / totalVotes * 100) : 0}%` }} /></div>}
    </div>)}
    {poll.results && <button className="inbox-poll-view-votes" type="button" onClick={() => setVotesOpen(true)}>{t('inbox.pollViewVotes')} · {voteLabel(totalVotes)}</button>}
    {resultStatusMessage && <small role="status" aria-live="polite" className={`inbox-poll-unavailable is-${poll.resultsStatus ?? 'unavailable'}`}>{resultStatusMessage}</small>}
    <Modal open={votesOpen} onOpenChange={setVotesOpen} title={t('inbox.pollViewVotes')} description={poll.title} closeLabel={t('common.close')} className="inbox-poll-votes-modal">
      <div className="inbox-poll-vote-groups">{results.map((option) => <section className="inbox-poll-vote-group" key={option.name}>
        <header><strong>{option.name}</strong><span>{voteLabel(option.count)}</span></header>
        {option.voters.length ? <><ul>{option.voters.slice(0, visibleVoters[option.name] ?? 25).map((voter) => <li key={voter.id}><span className="inbox-poll-voter-avatar" aria-hidden="true">{voter.name?.trim().slice(0, 1).toUpperCase() || '•'}</span><span className="inbox-poll-voter-copy"><strong>{voter.name || t('inbox.pollVoterUnknown')}</strong>{voter.phone && <small>{voter.phone}</small>}</span></li>)}</ul>{(visibleVoters[option.name] ?? 25) < option.voters.length && <button type="button" className="inbox-poll-show-more" onClick={() => setVisibleVoters((current) => ({ ...current, [option.name]: (current[option.name] ?? 25) + 25 }))}>{t('inbox.showMoreVoters')} · {Math.min(25, option.voters.length - (visibleVoters[option.name] ?? 25))}</button>}</> : <p>{t('inbox.pollNoVotes')}</p>}
      </section>)}</div>
    </Modal>
  </div>
}

function getDisplayHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}

type LinkPreviewData = { url: string; title: string | null; description: string | null; image: string | null }

function InboxLinkPreview({ url }: { url: string }) {
  const cached = linkPreviewCache.get(url)
  const [preview, setPreview] = useState<LinkPreviewData | null | undefined>(
    linkPreviewCache.has(url) ? (cached ?? null) : undefined,
  )
  useEffect(() => {
    if (linkPreviewCache.has(url)) return
    let active = true
    api.inbox.linkPreview(url)
      .then((result) => { if (!active) return; linkPreviewCache.set(url, result); setPreview(result) })
      .catch(() => { if (!active) return; linkPreviewCache.set(url, null); setPreview(null) })
    return () => { active = false }
  }, [url])
  if (!preview?.title) return null
  const host = getDisplayHost(preview.url)
  return <a className="inbox-link-preview" href={preview.url} target="_blank" rel="noopener noreferrer">
    {preview.image && <img className="inbox-link-preview-image" src={preview.image} alt="" loading="lazy" />}
    <div className="inbox-link-preview-body">
      {host && <small className="inbox-link-preview-url">{host}</small>}
      <strong className="inbox-link-preview-title">{preview.title}</strong>
      {preview.description && <p className="inbox-link-preview-desc">{preview.description}</p>}
    </div>
  </a>
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
  const [speed, setSpeed] = useState(1)

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
    setSpeed(1)
  }, [audioSrc])

  useEffect(() => { if (audioRef.current) audioRef.current.playbackRate = speed }, [speed])

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
    <button type="button" className="inbox-audio-speed" onClick={() => setSpeed((s) => s === 1 ? 1.5 : s === 1.5 ? 2 : 1)} aria-label={t('inbox.audioSpeed', { speed: speed === 1 ? '1×' : speed === 1.5 ? '1.5×' : '2×' })}>{speed === 1 ? '1×' : speed === 1.5 ? '1.5×' : '2×'}</button>
  </div>
}

function InboxMediaAttachment({ attachment, label, load, onOpen, onDownload }: {
  attachment: MessageAttachmentDto
  label: string
  load: (attachment: MessageAttachmentDto) => Promise<Blob>
  onOpen: (attachment: MessageAttachmentDto) => void
  onDownload: (attachment: MessageAttachmentDto) => void
}) {
  const { t } = useTranslation()
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
  const isAudio = attachment.mediaType === 'audio'
  return <div className={`inbox-inline-image${isAudio ? ' inbox-inline-audio' : ''}`} ref={containerRef}>
    {src && attachment.mediaType === 'image' ? <button type="button" className="inbox-inline-image-preview" onClick={() => onOpen(attachment)} aria-label={label}><img src={src} alt={attachment.fileName ?? label} loading="lazy" /></button>
      : src && attachment.mediaType === 'video' ? <video className="inbox-inline-video" src={src} controls preload="metadata" aria-label={attachment.fileName ?? label} />
      : src && isAudio ? <div className="inbox-inline-audio-row"><InboxAudioPlayer src={src} label={t('inbox.mediaTypes.audio')} compact /><a className="inbox-audio-download" href={src} download={attachment.fileName ?? 'audio'} aria-label={t('inbox.downloadAttachment', { name: t('inbox.mediaTypes.audio') })} title={t('inbox.download')}><Download size={15} aria-hidden="true" /></a></div>
      : <span className="inbox-inline-image-placeholder">{isAudio ? failed ? t('inbox.attachmentDownloadFailed') : t('inbox.mediaTypes.audio') : failed ? label : attachment.fileName ?? label}</span>}
    {!isAudio && <div className="inbox-inline-image-tools"><span>{attachment.fileName ?? label}</span><IconButton label={label} onClick={() => onDownload(attachment)}><Download size={14} aria-hidden="true" /></IconButton></div>}
  </div>
}

export function InboxWorkspace({ initialSearch = '', initialConversationId = '', onConversationRead }: { initialSearch?: string; initialConversationId?: string; onConversationRead?: () => void }) {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const globalBusinessLineId = searchParams.get('businessLineId') ?? ''
  const [conversations, setConversations] = useState<ConversationDto[]>([])
  const [selectedId, setSelectedId] = useState('')
  const selected = conversations.find((conversation) => conversation.id === selectedId)
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
  const [copiedMessageId, setCopiedMessageId] = useState('')
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
  const messageScrollPositionsRef = useRef<Map<string, number>>(new Map())
  const messageScrollRestoreKeyRef = useRef('')
  const isAtBottomRef = useRef(true)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const [scrollAwayCount, setScrollAwayCount] = useState(0)
  const prevMessageCountRef = useRef(0)
  const hiddenMessageIdsRef = useRef<Set<string>>(new Set())
  const [olderMessagesAvailable, setOlderMessagesAvailable] = useState(false)
  const [olderMessagesOffset, setOlderMessagesOffset] = useState(0)
  const [olderMessagesLoading, setOlderMessagesLoading] = useState(false)
  const conversationThreadRef = useRef<HTMLElement>(null)
  const messageDraftRef = useRef<HTMLTextAreaElement>(null)
  const draftsByConversationRef = useRef<Map<string, string>>(new Map())
  const messageDraftLiveRef = useRef('')
  const composerEmojiPickerRef = useRef<HTMLDetailsElement>(null)
  const [composerMode, setComposerMode] = useState<(typeof INBOX_COMPOSER_MODES)[number]>(INBOX_COMPOSER_MODE.reply)
  const [tagFilter, setTagFilter] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [tagColor, setTagColor] = useState('#dbeafe')
  const [tags, setTags] = useState<Array<{ id: string; name: string; color: string }>>([])
  const [tagBusy, setTagBusy] = useState(false)
  const [messageKey, setMessageKey] = useState(() => crypto.randomUUID())
  const [sendingMessage, setSendingMessage] = useState(false)
  const typingIdleTimerRef = useRef<number | null>(null)
  const typingPresenceConversationRef = useRef('')
  const typingPresenceLastSentAtRef = useRef(0)
  const typingPresenceQueueRef = useRef(Promise.resolve())
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
  const [contactDetailsEditOpen, setContactDetailsEditOpen] = useState(false)
  const [contactNameDraft, setContactNameDraft] = useState('')
  const [contactEmailDraft, setContactEmailDraft] = useState('')
  const [contactDetailsSaving, setContactDetailsSaving] = useState(false)
  const [contactDetailsError, setContactDetailsError] = useState('')
  const [leadSearch, setLeadSearch] = useState('')
  const [leadOptions, setLeadOptions] = useState<Array<{ id: string; accountName: string; contactName: string | null; phone: string | null }>>([])

  useEffect(() => { setBusinessLineFilter(globalBusinessLineId); setChannelFilter(''); setOffset(0) }, [globalBusinessLineId])
  useEffect(() => {
    setConversationIdFilter(initialConversationId)
    setOffset(0)
    setSelectedId(initialConversationId)
  }, [initialConversationId])
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
  const [opportunityOpen, setOpportunityOpen] = useState(false)
  const [opportunityRequestKey, setOpportunityRequestKey] = useState('')
  const [opportunitySummary, setOpportunitySummary] = useState('')
  const [opportunityFacts, setOpportunityFacts] = useState<string[]>([])
  const [opportunityUnknowns, setOpportunityUnknowns] = useState<string[]>([])
  const [opportunityNextAction, setOpportunityNextAction] = useState('')
  const [opportunityDueAt, setOpportunityDueAt] = useState('')
  const [opportunityGenerating, setOpportunityGenerating] = useState(false)
  const [opportunitySaving, setOpportunitySaving] = useState(false)
  const [opportunityError, setOpportunityError] = useState('')
  const refreshSequence = useRef(0)
  const readCursorKey = useRef('')
  const skipUnreadAutoSelect = useRef(false)
  const refreshMessagesRef = useRef<() => void>(() => {})
  const refreshRef = useRef<(quiet?: boolean) => Promise<void>>(async () => {})
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const unreadOnlyRef = useRef(unreadOnly)
  unreadOnlyRef.current = unreadOnly
  const onConversationReadRef = useRef(onConversationRead)
  onConversationReadRef.current = onConversationRead
  messageDraftLiveRef.current = messageDraft

  useEffect(() => {
    const closeMenusOutside = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      document.querySelectorAll<HTMLDetailsElement>('.inbox-message-action-menu[open], .inbox-message-reaction-menu[open], .inbox-composer-emoji-picker[open]').forEach((menu) => {
        if (!menu.contains(target)) menu.open = false
      })
    }
    const closeMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const openMenus = document.querySelectorAll<HTMLDetailsElement>('.inbox-message-action-menu[open], .inbox-message-reaction-menu[open], .inbox-composer-emoji-picker[open]')
      if (openMenus.length === 0) return
      openMenus.forEach((menu) => { menu.open = false })
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('pointerdown', closeMenusOutside)
    document.addEventListener('keydown', closeMenusOnEscape, true)
    return () => {
      document.removeEventListener('pointerdown', closeMenusOutside)
      document.removeEventListener('keydown', closeMenusOnEscape, true)
    }
  }, [])

  const refreshAfterConversationRead = (conversationId: string) => {
    if (selectedIdRef.current === conversationId && unreadOnlyRef.current) skipUnreadAutoSelect.current = true
    void refreshRef.current(true)
    onConversationReadRef.current?.()
  }

  useEffect(() => {
    if (messagesConversationId !== selectedId || messages.length === 0) return
    const container = messagesContainerRef.current
    if (!container) return
    const restoreKey = `${selectedId}:${messageSearch}`
    if (messageScrollRestoreKeyRef.current !== restoreKey) {
      const savedScrollTop = messageScrollPositionsRef.current.get(restoreKey)
      if (savedScrollTop !== undefined) container.scrollTop = Math.min(savedScrollTop, Math.max(0, container.scrollHeight - container.clientHeight))
      else if (!messageSearch && selected?.firstUnreadMessageId) {
        const unreadMessage = container.querySelector<HTMLElement>(`[data-message-id="${selected.firstUnreadMessageId}"]`)
        if (unreadMessage) container.scrollTop = Math.max(0, unreadMessage.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 24)
        else container.scrollTop = container.scrollHeight
      } else container.scrollTop = container.scrollHeight
      messageScrollRestoreKeyRef.current = restoreKey
    }
    messageScrollPositionsRef.current.set(restoreKey, container.scrollTop)
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80
    isAtBottomRef.current = atBottom
    setShowScrollButton(!atBottom)
    const frame = window.requestAnimationFrame(() => markVisibleMessagesRead())
    return () => window.cancelAnimationFrame(frame)
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
  useEffect(() => { isAtBottomRef.current = true; setShowScrollButton(false); setScrollAwayCount(0); prevMessageCountRef.current = 0; messageScrollRestoreKeyRef.current = '' }, [selectedId, messageSearch])
  useEffect(() => {
    const id = selectedId
    return () => {
      if (!id) return
      const draft = messageDraftLiveRef.current
      if (draft.trim()) draftsByConversationRef.current.set(id, draft)
      else draftsByConversationRef.current.delete(id)
    }
  }, [selectedId])
  useEffect(() => { setMessageDraft(''); setMessageSearchDraft(''); setMessageSearch(''); setMediaDraft(null); setContactMode(false); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }); setMessageKey(crypto.randomUUID()); setMessageSendError(''); setUnknownDeliveryPending(false); setComposerMode(INBOX_COMPOSER_MODE.reply); hiddenMessageIdsRef.current = new Set() }, [selectedId])
  useEffect(() => { if (!selectedId) return; setMessageDraft(draftsByConversationRef.current.get(selectedId) ?? '') }, [selectedId])
  useEffect(() => {
    if (!selectedId) { setMessages([]); setMessagesConversationId(''); return }
    let active = true
    let requestInFlight = false
    let refreshQueued = false
    setMessages([])
    setMessagesConversationId('')
    setOlderMessagesAvailable(false)
    setOlderMessagesOffset(0)
    setMessagesLoadError(false)
    setMessagesLoading(true)
    const loadMessages = async (initial = false) => {
      if (requestInFlight) { refreshQueued = true; return }
      requestInFlight = true
      try {
        const result = await api.inbox.messages(selectedId, { limit: 100, search: messageSearch })
        if (active) {
          setMessagesLoadError(false)
          setOlderMessagesAvailable(result.length === 100)
          setMessages((current) => {
            const filtered = result.filter((m) => !hiddenMessageIdsRef.current.has(m.id))
            const stable = current.length === filtered.length && current.every((message, index) => {
              const next = filtered[index]
              return message.id === next?.id && message.deliveryState === next.deliveryState && message.bodyText === next.bodyText && message.transcriptText === next.transcriptText && message.isDeleted === next.isDeleted
            })
            if (stable) return current
            return [...new Map([...current, ...filtered].map((message) => [message.id, message])).values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))
          })
          setMessagesConversationId(selectedId)
        }
      } catch {
        if (active) setMessagesLoadError(true)
      } finally {
        requestInFlight = false
        if (active && initial) setMessagesLoading(false)
        if (active && refreshQueued) {
          refreshQueued = false
          void loadMessages()
        }
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
    const count = messages.length
    if (count > prevMessageCountRef.current && !isAtBottomRef.current) {
      setScrollAwayCount((n) => n + count - prevMessageCountRef.current)
      setShowScrollButton(true)
    }
    prevMessageCountRef.current = count
  }, [messages.length])
  useEffect(() => {
    let active = true
    let stream: EventSource | null = null
    const refreshOnConnect = () => {
      if (document.visibilityState !== 'visible') return
      void refreshRef.current(true)
      refreshMessagesRef.current()
    }
    const safetyRefresh = window.setInterval(refreshOnConnect, INBOX_REALTIME_REFRESH_INTERVAL_MS)
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
      stream.addEventListener('ready', refreshOnConnect)
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
    }).catch(refreshOnConnect)
    return () => {
      active = false
      stream?.close()
      window.clearInterval(safetyRefresh)
      if (presenceTimerRef.current !== null) window.clearTimeout(presenceTimerRef.current)
      document.removeEventListener('visibilitychange', refreshOnReturn)
    }
  }, [])
  const markVisibleMessagesRead = () => {
    const container = messagesContainerRef.current
    if (!selectedId || messagesConversationId !== selectedId || document.visibilityState !== 'visible' || !container) return
    const bounds = container.getBoundingClientRect()
    const visibleInbound = [...container.querySelectorAll<HTMLElement>('.inbox-message[data-direction="inbound"][data-message-id]')]
      .filter((message) => { const rect = message.getBoundingClientRect(); return rect.bottom > bounds.top && rect.top < bounds.bottom })
    const lastVisible = visibleInbound.at(-1)?.dataset.messageId
    if (!lastVisible) return
    const cursor = `${selectedId}:${lastVisible}`
    if (readCursorKey.current === cursor) return
    readCursorKey.current = cursor
    api.inbox.markRead(selectedId, lastVisible).then(() => {
      refreshAfterConversationRead(selectedId)
    }).catch(() => { readCursorKey.current = ''; setError(t('inbox.readFailed')) })
  }
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
  const activeAdvancedFilterCount = [businessLineFilter, channelFilter, tagFilter, statusFilter, ownerFilter, unreadOnly ? 'unread' : '', conversationIdFilter].filter(Boolean).length
  const quickView = unreadOnly ? 'unread' : currentUserId && ownerFilter === currentUserId ? 'mine' : ownerFilter === 'unassigned' ? 'unassigned' : 'all'
  const applyQuickView = (view: 'all' | 'mine' | 'unassigned' | 'unread') => {
    setUnreadOnly(view === 'unread')
    setOwnerFilter(view === 'mine' ? currentUserId : view === 'unassigned' ? 'unassigned' : '')
    setOffset(0)
  }
  const clearConversationFilters = () => { setConversationIdFilter(''); setConversationSearch(''); setDebouncedSearch(''); setStatusFilter(''); setOwnerFilter(''); setUnreadOnly(false); setBusinessLineFilter(''); setChannelFilter(''); setTagFilter(''); setOffset(0) }
  const canSend = Boolean(selected && selected.ownerUserId === currentUserId && selected.automationMode === 'human' && selected.replyAvailable)
  const queueTypingPresence = (conversationId: string, state: 'composing' | 'paused') => {
    typingPresenceQueueRef.current = typingPresenceQueueRef.current
      .catch(() => undefined)
      .then(async () => { await api.inbox.setTypingPresence(conversationId, state).catch(() => undefined) })
  }
  const stopTypingPresence = (conversationId = typingPresenceConversationRef.current) => {
    if (typingIdleTimerRef.current !== null) window.clearTimeout(typingIdleTimerRef.current)
    typingIdleTimerRef.current = null
    if (!conversationId || conversationId !== typingPresenceConversationRef.current) return
    typingPresenceConversationRef.current = ''
    typingPresenceLastSentAtRef.current = 0
    queueTypingPresence(conversationId, 'paused')
  }
  const updateTypingPresence = (draft: string) => {
    if (!draft.trim() || composerMode !== INBOX_COMPOSER_MODE.reply || !canSend || contactMode || !selectedId) {
      stopTypingPresence()
      return
    }
    const now = Date.now()
    if (typingPresenceConversationRef.current !== selectedId || now - typingPresenceLastSentAtRef.current >= 8000) {
      typingPresenceConversationRef.current = selectedId
      typingPresenceLastSentAtRef.current = now
      queueTypingPresence(selectedId, 'composing')
    }
    if (typingIdleTimerRef.current !== null) window.clearTimeout(typingIdleTimerRef.current)
    typingIdleTimerRef.current = window.setTimeout(() => stopTypingPresence(selectedId), 2500)
  }
  useEffect(() => () => stopTypingPresence(), [selectedId])
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
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        await refresh(true)
        setError(t('inbox.controlConflict'))
      } else {
        setError(caught instanceof ApiError && caught.code === 'ASSISTANT_AGENT_DISABLED' ? t('inbox.assistantNotEnabled') : t('inbox.controlFailed'))
      }
    } finally {
      setControlling(false)
    }
  }
  const insertComposerEmoji = (emoji: string) => {
    const textarea = messageDraftRef.current
    if (!textarea) return
    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? start
    const nextDraft = `${textarea.value.slice(0, start)}${emoji}${textarea.value.slice(end)}`
    if (nextDraft.length > 4096) return
    setMessageDraft(nextDraft)
    setMessageSendError('')
    composerEmojiPickerRef.current && (composerEmojiPickerRef.current.open = false)
    window.requestAnimationFrame(() => {
      textarea.focus()
      const cursor = start + emoji.length
      textarea.setSelectionRange(cursor, cursor)
    })
  }
  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    stopTypingPresence()
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
      if (composerMode === INBOX_COMPOSER_MODE.reply) await refresh(true)
      if (composerMode === INBOX_COMPOSER_MODE.reply && message.deliveryState === INBOX_DELIVERY_STATE.unknown) {
        setUnknownDeliveryPending(true)
        setMessageSendError(t('inboxRetry.deliveryUnknown'))
      } else {
        setMessageDraft(''); messageDraftLiveRef.current = ''; draftsByConversationRef.current.delete(selected.id); setReplyTarget(null); setMediaDraft(null); setContactMode(false); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }); setMessageKey(crypto.randomUUID())
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
      await refresh(true)
    } catch {
      setMessageSendError(t('inbox.reactionFailed'))
    } finally {
      setReactionBusyMessageId('')
    }
  }
  const hideMessage = async (target: MessageDto) => {
    if (!selected || !window.confirm(t('inbox.hideMessageConfirm'))) return
    try {
      await api.inbox.hideMessage(selected.id, target.id)
      hiddenMessageIdsRef.current.add(target.id)
      setMessages((current) => current.filter((message) => message.id !== target.id))
    } catch {
      setMessageSendError(t('inbox.hideMessageFailed'))
    }
  }
  const copyMessage = async (target: MessageDto) => {
    const content = target.bodyText ?? target.transcriptText
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(target.id)
      window.setTimeout(() => setCopiedMessageId((current) => current === target.id ? '' : current), 1800)
    } catch {
      setMessageSendError(t('inbox.copyMessageFailed'))
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
      await api.inbox.addTag(selected.id, tagDraft.trim(), tagColor)
      setTagDraft('')
      setTagColor('#dbeafe')
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
  const openContactDetailsEdit = () => {
    if (!selected) return
    setContactNameDraft(selected.personName ?? '')
    setContactEmailDraft(selected.personEmail ?? '')
    setContactDetailsError('')
    setContactDetailsEditOpen(true)
  }
  const saveContactDetails = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || contactNameDraft.trim().length < 2) return
    setContactDetailsSaving(true)
    setContactDetailsError('')
    try {
      await api.inbox.updateContactDetails(selected.id, { name: contactNameDraft.trim(), email: contactEmailDraft.trim() })
      setContactDetailsEditOpen(false)
      await refresh()
    } catch (error) {
      setContactDetailsError(error instanceof ApiError && error.code === 'PERMISSION_DENIED'
        ? t('inbox.contactNameEdit.permissionDenied')
        : t('inbox.contactNameEdit.failed'))
    } finally {
      setContactDetailsSaving(false)
    }
  }
  const openOpportunityCreation = () => {
    if (!selected) return
    setOpportunityRequestKey(crypto.randomUUID())
    setLeadSearch(''); setLeadOptions([]); setReconcileLeadId(''); setReconcileLead(null)
    setOpportunitySummary(''); setOpportunityFacts([]); setOpportunityUnknowns([]); setOpportunityNextAction(''); setOpportunityDueAt(''); setOpportunityError(''); setOpportunityOpen(true)
  }
  useEffect(() => {
    if ((!reconcileOpen && !opportunityOpen) || leadSearch.trim().length < 2) { setLeadOptions([]); setLeadSearchLoading(false); setLeadSearchFailed(false); return }
    let active = true
    setLeadSearchLoading(true); setLeadSearchFailed(false)
    const timer = window.setTimeout(() => { void api.leads.listPage({ businessLineId: selected?.businessLineId ?? undefined, search: leadSearch.trim(), limit: 10, offset: 0 }).then((result) => { if (active) setLeadOptions(result.data.map((lead) => ({ id: lead.id, accountName: lead.accountName, contactName: lead.contactName, phone: lead.phone }))) }).catch(() => { if (active) { setLeadOptions([]); setLeadSearchFailed(true) } }).finally(() => { if (active) setLeadSearchLoading(false) }) }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [reconcileOpen, opportunityOpen, leadSearch, selected?.businessLineId])
  const generateOpportunityContext = async () => {
    if (!selected) return
    setOpportunityGenerating(true); setOpportunityError('')
    try {
      const result = await api.agents.assistConversation(selected.id, { mode: ASSISTANT_CONVERSATION_ASSIST_MODE.summary })
      setOpportunitySummary(result.summary); setOpportunityFacts(result.confirmedFacts); setOpportunityUnknowns(result.unknowns); setOpportunityNextAction(result.nextStep)
    } catch { setOpportunityError(t('inbox.opportunityCreation.aiFailed')) }
    finally { setOpportunityGenerating(false) }
  }
  const saveOpportunityFromConversation = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selected || !reconcileLeadId || !opportunitySummary.trim() || !opportunityNextAction.trim() || !opportunityDueAt) return
    setOpportunitySaving(true); setOpportunityError('')
    try {
      await api.inbox.createOpportunity(selected.id, { requestKey: opportunityRequestKey || crypto.randomUUID(), leadId: reconcileLeadId, createOpportunity: true, summary: opportunitySummary.trim(), confirmedFacts: opportunityFacts, unknowns: opportunityUnknowns, nextAction: opportunityNextAction.trim(), nextActionAt: new Date(opportunityDueAt).toISOString() })
      setOpportunityOpen(false); await refresh()
    } catch (error) { setOpportunityError(error instanceof ApiError && error.code === 'CONVERSATION_OPPORTUNITY_CONFLICT' ? t('inbox.opportunityCreation.conflict') : t('inbox.opportunityCreation.failed')) }
    finally { setOpportunitySaving(false) }
  }
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
  const handleMessagesScroll = () => {
    markVisibleMessagesRead()
    const container = messagesContainerRef.current
    if (!container) return
    if (selectedId && messagesConversationId === selectedId) messageScrollPositionsRef.current.set(`${selectedId}:${messageSearch}`, container.scrollTop)
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80
    isAtBottomRef.current = atBottom
    if (atBottom) { setShowScrollButton(false); setScrollAwayCount(0) } else setShowScrollButton(true)
  }
  const selectConversation = (conversationId: string) => {
    const container = messagesContainerRef.current
    if (container && selectedId && messagesConversationId === selectedId) messageScrollPositionsRef.current.set(`${selectedId}:${messageSearch}`, container.scrollTop)
    setSelectedId(conversationId)
    if (window.matchMedia('(max-width: 760px)').matches) conversationThreadRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  }
  const formatMessageDate = (date: Date): string => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return t('inbox.today')
    if (date.toDateString() === yesterday.toDateString()) return t('inbox.yesterday')
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(date)
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

  const groupConversationName = selected?.conversationType === 'group' ? getGroupConversationName(selected.displayName, t('inbox.groupConversation')) : ''

  return <section className={`inbox-page${contactContextOpen ? '' : ' inbox-context-collapsed'}`}>
    <header className="inbox-heading"><div><h2>{t('inbox.title')}</h2></div>
      <Button className="refresh" disabled={sendingMessage} onClick={() => void refresh()} aria-label={t('inbox.refresh')}><RefreshCw size={16} /></Button>
    </header>
    {error && <WorkspaceState kind="error" compact message={error} />}
    <div className="inbox-layout">
      <aside id="inbox-contact-context" className="inbox-contact-panel" aria-label={t('inbox.leadDetails')}>
        {!selected ? <WorkspaceState kind="empty" compact message={t('inbox.selectConversation')} /> : <>
          <div className="inbox-contact-panel-header"><div className="inbox-contact-identity"><span><UserRound size={21} /></span><div><h3>{selected.conversationType === 'group' ? groupConversationName : selected.personName ?? t('inbox.unknownContact')}</h3><p>{presenceState === 'composing' ? t('inbox.presenceTyping') : presenceState === 'recording' ? t('inbox.presenceRecording') : selected.conversationType === 'group' ? t('inbox.groupConversation') : selected.accountName ?? t('inbox.noCompany')}</p></div></div><IconButton label={t('common.close')} onClick={() => setContactContextOpen(false)}><X size={17} aria-hidden="true" /></IconButton></div>
          {selected.conversationType === 'group' && <section className="inbox-contact-section inbox-group-participants"><h4>{t('inbox.groupParticipants')}</h4>{groupParticipantsLoading ? <p>{t('inbox.groupParticipantsLoading')}</p> : groupParticipantsFailed ? <p role="status">{t('inbox.groupParticipantsFailed')}</p> : groupParticipants?.supported ? <>{groupParticipants.stale && <p role="status">{t('inbox.groupParticipantsCached')}</p>}<ul>{groupParticipants.participants.map((participant) => <li key={participant.id}><span className="inbox-group-participant-copy"><span>{participant.name && !participant.name.includes('@') ? participant.name : participant.phone ?? t('inbox.groupParticipantUnknown')}</span>{participant.phone && participant.name && !participant.name.includes('@') && <small>{participant.phone}</small>}</span>{participant.isAdmin && <small>{t('inbox.groupParticipantAdmin')}</small>}</li>)}</ul></> : groupParticipants && !groupParticipants.supported ? <p>{t('inbox.groupParticipantsUnsupported')}</p> : null}</section>}
          <section className="inbox-contact-section"><h4>{t('inbox.contactDetails')}</h4><dl>
            <div><dt><Mail size={14} />{t('inbox.email')}</dt><dd>{selected.personEmail ?? '—'}</dd></div>
            <div><dt><Phone size={14} />{t('inbox.phone')}</dt><dd>{selected.personPhone ?? '—'}</dd></div>
            <div><dt><Building2 size={14} />{t('inbox.company')}</dt><dd>{selected.accountName ?? '—'}</dd></div>
          </dl></section>
          {selected.conversationType !== 'group' && <Button type="button" onClick={openContactDetailsEdit}>{t('inbox.contactNameEdit.action')}</Button>}
          {selected.ownerUserId === currentUserId && <Button type="button" onClick={openContactReconciliation}>{t('inbox.contactReconciliation.action')}</Button>}
          {selected.ownerUserId === currentUserId && <Button type="button" onClick={openOpportunityCreation}><Sparkles size={15} aria-hidden="true" />{t('inbox.opportunityCreation.action')}</Button>}
          <section className="inbox-contact-section"><h4>{t('inbox.leadContext')}</h4><dl>
            <div><dt>{t('inbox.leadStatus')}</dt><dd>{selected.lead ? t(`leadStatuses.${selected.lead.status}`, { defaultValue: selected.lead.status }) : t('inbox.noLead')}</dd></div>
            <div><dt>{t('inbox.leadSource')}</dt><dd>{selected.lead ? t(`leads.sources.${selected.lead.source}`, { defaultValue: selected.lead.source }) : '—'}</dd></div>
            <div><dt><CalendarClock size={14} />{t('inbox.nextAction')}</dt><dd>{selected.lead?.nextActionAt ? formatDate(selected.lead.nextActionAt) : '—'}</dd></div>
            <div><dt>{t('inbox.owner')}</dt><dd>{selected.ownerName ?? t('inbox.unassigned')}</dd></div>
            <div><dt>{t('inbox.channel')}</dt><dd>{selected.channelName ?? selected.provider}</dd></div>
            <div><dt>{t('inbox.statusLabel')}</dt><dd>{t(`inbox.status.${selected.status}`)}</dd></div>
          </dl></section>
          {selected.assistantQualification && <section className="inbox-qualification" aria-label={t('assistantQualification.title')}><header><ClipboardList size={17} /><strong>{t('assistantQualification.title')}</strong><span>{t(`assistantQualification.intents.${selected.assistantQualification.intent}`)}</span></header><p>{selected.assistantQualification.summary}</p><div className="inbox-qualification-columns"><div><strong>{t('assistantQualification.confirmed')}</strong>{selected.assistantQualification.confirmedFacts.length ? <ul>{selected.assistantQualification.confirmedFacts.map((fact, index) => <li key={`${index}-${fact}`}>{fact}</li>)}</ul> : <p>{t('assistantQualification.none')}</p>}</div><div><strong>{t('assistantQualification.unknowns')}</strong>{selected.assistantQualification.unknowns.length ? <ul>{selected.assistantQualification.unknowns.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>{t('assistantQualification.none')}</p>}</div></div><div className="inbox-qualification-next"><strong>{t('assistantQualification.nextStep')}</strong><p>{selected.assistantQualification.nextStep}</p></div><small>{t('assistantQualification.updated', { date: new Date(selected.assistantQualification.updatedAt).toLocaleString(i18n.language) })}</small></section>}
          <div className="inbox-tag-manager"><strong>{t('inboxComposer.tagsLabel')}</strong><div className="inbox-tag-list">{selected.tags.map((tag) => <span key={tag.id} style={{ '--tag-color': tag.color } as React.CSSProperties}>{tag.name}{canEditTags && <IconButton label={t('inboxComposer.removeTag', { name: tag.name })} disabled={tagBusy} onClick={() => void removeTag(tag.id)}><X size={12} aria-hidden="true" /></IconButton>}</span>)}</div>{canEditTags && <div className="inbox-tag-create"><TextField value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} maxLength={32} placeholder={t('inboxComposer.tagPlaceholder')} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addTag() } }} /><label className="inbox-tag-color"><span>{t('inboxComposer.tagColor')}</span><input type="color" value={tagColor} onChange={(event) => setTagColor(event.target.value)} aria-label={t('inboxComposer.tagColor')} /></label><Button type="button" disabled={tagBusy || tagDraft.trim().length < 2} onClick={() => void addTag()}>{tagBusy ? t('common.saving') : t('inboxComposer.addTag')}</Button></div>}</div>
        </>}
      </aside>
      <section ref={conversationThreadRef} className="inbox-thread" aria-label={t('inbox.thread')}>
        {!selected ? <WorkspaceState kind={loading ? 'loading' : 'empty'} message={loading ? t('common.loading') : t('inbox.selectConversation')} detail={t('inbox.readOnly')} /> : <>
          <header className="inbox-thread-heading"><div><Button type="button" className="inbox-mobile-queue-nav" onClick={() => conversationQueueRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}><ArrowLeft size={15} />{t('inbox.conversationList')}</Button><strong>{selected.conversationType === 'group' ? groupConversationName : selected.personName ?? selected.accountName ?? t('inbox.unknownContact')}</strong><span>{selected.conversationType === 'group' ? t('inbox.groupConversation') : selected.personPhone ?? selected.channelName ?? selected.provider}</span><small>{t('inbox.owner')}: {selected.ownerName ?? t('inbox.unassigned')} · {t('inbox.automation')}: {t(`inbox.modes.${selected.automationMode}`)}</small>{presenceState && <small>{presenceState === "composing" ? t("inbox.presenceTyping") : t("inbox.presenceRecording")}</small>}</div><div className="inbox-control-actions">
            <Button type="button" className="inbox-context-toggle" aria-controls="inbox-contact-context" aria-expanded={contactContextOpen} onClick={() => setContactContextOpen((open) => !open)}><UserRound size={15} />{t('inbox.leadDetails')}</Button>
            {(!selected.ownerUserId || selected.ownerUserId === currentUserId) && assignees.length > 0 && <><label className="inbox-assignee-select"><span>{t('inbox.assignTo')}</span><SelectField value={assigneeTarget} onChange={(event) => setAssigneeTarget(event.target.value)} disabled={controlling}><option value="" disabled>{t('inbox.selectAssignee')}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</SelectField></label><Button type="button" disabled={controlling || !assigneeTarget} onClick={() => void controlConversation('assign')}>{t('inbox.assign')}</Button></>}
            {!selected.ownerUserId && <Button type="button" disabled={controlling} onClick={() => void controlConversation('claim')}>{controlling ? t('inbox.claiming') : t('inbox.claim')}</Button>}
            {selected.ownerUserId === currentUserId && selected.automationMode === 'human' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('pause')}>{t('inbox.pauseAssistant')}</Button>}
            {selected.automationMode === 'paused' && selected.assistantResumeAvailable && (!selected.ownerUserId || selected.ownerUserId === currentUserId) && <Button type="button" disabled={controlling} onClick={() => void controlConversation('assistant')}>{t('inbox.resumeAssistant')}</Button>}
            {selected.ownerUserId === currentUserId && <Button type="button" disabled={controlling} onClick={() => void controlConversation('release')}>{t('inbox.release')}</Button>}
            {selected.ownerUserId === currentUserId && selected.status !== 'resolved' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('resolve')}>{t('inbox.resolve')}</Button>}
            {selected.ownerUserId === currentUserId && selected.status === 'resolved' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('reopen')}>{t('inbox.reopen')}</Button>}
            <span className="tag">{t(`inbox.status.${selected.status}`)}</span></div></header>
          <form className="inbox-message-search" onSubmit={(event) => { event.preventDefault(); setMessageSearch(messageSearchDraft.trim()) }}><label htmlFor="inbox-message-search">{t('inboxSearch.label')}</label><span className="inbox-search-input-wrap"><TextField id="inbox-message-search" value={messageSearchDraft} onChange={(event) => setMessageSearchDraft(event.target.value)} maxLength={200} placeholder={t('inboxSearch.placeholder')} />{messageSearchDraft && <button type="button" className="inbox-search-clear" aria-label={t('inbox.clearSearch')} onClick={() => { setMessageSearchDraft(''); setMessageSearch('') }}><X size={15} aria-hidden="true" /></button>}</span><Button type="submit" disabled={messagesLoading}>{t('inboxSearch.search')}</Button>{messageSearch && <Button type="button" onClick={() => { setMessageSearchDraft(''); setMessageSearch('') }}>{t('inboxSearch.clear')}</Button>}</form>
          <div className="inbox-messages-container"><div ref={messagesContainerRef} className="inbox-messages" onScroll={handleMessagesScroll} role="log" aria-label={t('inbox.thread')} aria-relevant="additions text" aria-atomic="false">
            {messagesLoading ? <div className="inbox-message-state"><WorkspaceState kind="loading" compact message={t('common.loading')} /></div> : messagesLoadError && messages.length === 0 ? <div className="inbox-message-state"><WorkspaceState kind="error" compact message={t('inbox.messagesFailed')}><Button type="button" onClick={() => refreshMessagesRef.current()}>{t('platform.retry')}</Button></WorkspaceState></div> : <>{messagesLoadError && <WorkspaceState kind="error" compact message={t('inbox.messagesFailed')} detail={t('table.resultsRetained')}><Button type="button" onClick={() => refreshMessagesRef.current()}>{t('platform.retry')}</Button></WorkspaceState>}{messages.length === 0 ? <div className="inbox-message-state"><WorkspaceState kind="empty" compact message={messageSearch ? t('inboxSearch.empty') : t('inbox.noMessagesYet')} detail={messageSearch ? undefined : t('inbox.emptyMessagesHint')} /></div> : <>{olderMessagesAvailable && <div className="inbox-load-older"><Button type="button" disabled={olderMessagesLoading} onClick={async () => { const beforeHeight = messagesContainerRef.current?.scrollHeight ?? 0; setOlderMessagesLoading(true); try { const older = await api.inbox.messages(selected.id, { limit: 100, offset: olderMessagesOffset, search: messageSearch }); const visibleOlder = older.filter((m) => !hiddenMessageIdsRef.current.has(m.id)); setMessages((current) => [...new Map([...visibleOlder, ...current].map((message) => [message.id, message])).values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id))); setOlderMessagesAvailable(older.length === 100); setOlderMessagesOffset((current) => current + older.length); requestAnimationFrame(() => { const node = messagesContainerRef.current; if (node) node.scrollTop += node.scrollHeight - beforeHeight }) } catch { setMessagesLoadError(true) } finally { setOlderMessagesLoading(false) } }}>{olderMessagesLoading ? t('inbox.loadingOlderMessages') : t('inbox.loadOlderMessages')}</Button></div>}{messages.map((message, index) => { const prev = messages[index - 1]; const next = messages[index + 1]; const msgDate = new Date(message.occurredAt); const showDateSep = !prev || msgDate.toDateString() !== new Date(prev.occurredAt).toDateString(); return <Fragment key={message.id}>{showDateSep && <div className="inbox-date-separator" role="separator"><span>{formatMessageDate(msgDate)}</span></div>}<article data-message-id={message.id} data-direction={message.direction} className={`inbox-message ${message.direction}${message.direction === 'internal' && message.actorType === 'assistant' ? ' is-ai-note' : ''}${getGroupClass(message, prev, next)}`}>
              {message.id === selected.firstUnreadMessageId && <div className="inbox-unread-divider">{t("inbox.firstUnread")}</div>}<div className="inbox-message-meta">{message.direction === 'internal' && <span className={message.actorType === 'assistant' ? 'inbox-note-ai' : ''}>{t('inboxComposer.internalNoteBy', { name: message.actorName ?? (message.actorType === 'assistant' ? t('inbox.actor.assistant') : t('inbox.actor.user')) })}</span>}<time dateTime={message.occurredAt}>{formatDate(message.occurredAt)}</time></div>
              {message.isDeleted ? <p className="inbox-message-deleted">{t('inbox.messageDeleted')}</p> : <>{selected.conversationType === 'group' && message.direction === 'inbound' && message.providerMetadata?.evolution?.author?.name && <small className="inbox-group-author">{message.providerMetadata.evolution.author.name}</small>}{message.providerMetadata?.evolution?.quotedMessage?.bodyText && <blockquote className="inbox-message-quote">{message.providerMetadata.evolution.quotedMessage.bodyText}</blockquote>}{message.providerMetadata?.evolution?.reaction && <small>{t('inbox.reactionSent', { emoji: message.providerMetadata.evolution.reaction.emoji })}</small>}{message.providerMetadata?.evolution?.encryptedReaction && <small className="inbox-encrypted-reaction" title={t('inbox.reactionUnavailableHint')}><SmilePlus size={14} aria-hidden="true" />{t('inbox.reactionUnavailable')}</small>}{message.providerMetadata?.evolution?.richContent?.kind === 'card' ? <div className="inbox-rich-card">{message.attachments.filter((attachment) => attachment.mediaType === 'image').map((attachment) => <InboxMediaAttachment key={attachment.id} attachment={attachment} label={t('inbox.attachmentPreview')} load={loadAttachment} onOpen={(item) => void openAttachment(item)} onDownload={(item) => void openAttachment(item)} />)}{message.providerMetadata.evolution.richContent.title && <strong>{message.providerMetadata.evolution.richContent.title}</strong>}{message.providerMetadata.evolution.richContent.body && <p>{message.providerMetadata.evolution.richContent.body}</p>}{message.providerMetadata.evolution.richContent.buttonUrl && /^https?:\/\//i.test(message.providerMetadata.evolution.richContent.buttonUrl) && <a className="inbox-rich-card-action" href={message.providerMetadata.evolution.richContent.buttonUrl} target="_blank" rel="noopener noreferrer">{message.providerMetadata.evolution.richContent.buttonLabel ?? t('inbox.openLink')}</a>}</div> : message.providerMetadata?.evolution?.richContent?.kind === "poll" ? null : message.bodyText ? <InboxMessageBody text={message.bodyText} /> : !message.transcriptText && message.attachments.length === 0 && !message.providerMetadata?.evolution?.encryptedReaction && <p>{message.providerMetadata?.evolution?.unsupportedType?.toLowerCase().replace(/[^a-z]/g, '') === 'encreactionmessage' ? t('inbox.reactionUnavailable') : message.providerMetadata?.evolution?.unsupportedType ? t('inbox.unsupportedMessageType', { type: message.providerMetadata.evolution.unsupportedType }) : t('inbox.nonTextMessage')}</p>}{message.providerMetadata?.evolution?.richContent?.kind === 'poll' && <InboxPollCard poll={message.providerMetadata.evolution.richContent} />}{message.transcriptText && <p className="inbox-transcript"><strong>{t('inbox.transcript')}</strong> {message.transcriptText}</p>}{message.bodyText && message.attachments.length === 0 && extractFirstUrl(message.bodyText) ? <InboxLinkPreview url={extractFirstUrl(message.bodyText)!} /> : null}{message.attachments.map((attachment) => message.providerMetadata?.evolution?.richContent?.kind === 'card' && attachment.mediaType === 'image' ? null : attachment.status === 'available' && ['image', 'video', 'audio'].includes(attachment.mediaType) ? <InboxMediaAttachment key={attachment.id} attachment={attachment} label={t('inbox.attachmentPreview')} load={loadAttachment} onOpen={(item) => void openAttachment(item)} onDownload={(item) => void openAttachment(item)} /> : <div className={`inbox-attachment ${attachment.status === 'failed' ? 'is-failed' : ''}`} key={attachment.id}><Paperclip size={15} aria-hidden="true" /><span className="inbox-attachment-copy"><strong>{attachment.fileName ?? t(`inbox.mediaTypes.${attachment.mediaType}`)}</strong><small className={`inbox-attachment-status is-${attachment.status}`}>{attachmentRetryFailedId === attachment.id ? t('inbox.attachmentRetryFailed') : attachment.status === 'available' ? attachment.mimeType ?? t('inbox.attachmentReady') : t(`inbox.attachmentStatus.${attachment.status}`)}</small>{attachment.status === 'failed' && <small className="inbox-attachment-diagnostic">{t('inbox.attachmentFailureDetail', { stage: attachment.lastErrorStage ? t(`inbox.attachmentStage.${attachment.lastErrorStage}`, { defaultValue: attachment.lastErrorStage }) : t('inbox.attachmentUnknownStage'), code: attachment.lastErrorCode ?? 'MEDIA_DOWNLOAD_FAILED', attempts: attachment.attemptCount })}</small>}</span>{attachment.status === 'available' && <IconButton label={t('inbox.downloadAttachment', { name: attachment.fileName ?? t(`inbox.mediaTypes.${attachment.mediaType}`) })} onClick={() => void openAttachment(attachment)}><Download size={14} aria-hidden="true" /></IconButton>}{message.direction === 'inbound' && attachment.status === 'failed' && <IconButton className={retryingAttachmentId === attachment.id ? 'is-loading' : ''} label={retryingAttachmentId === attachment.id ? t('inbox.retryingAttachment') : t('inbox.retryAttachment')} disabled={retryingAttachmentId === attachment.id || sendingMessage} onClick={() => void retryAttachment(attachment)}><RefreshCw size={14} aria-hidden="true" /></IconButton>}</div>)}</>}{message.direction === 'outbound' && <div className={`inbox-outbound-status ${message.deliveryState === 'read' ? 'is-read' : ''}`} aria-label={t(`inbox.delivery.${message.deliveryState}`)} data-delivery-state={message.deliveryState} title={message.deliveryState === 'unknown' ? t('inbox.delivery.unknownSince', { date: formatDate(message.occurredAt) }) : undefined}>{message.deliveryState === 'requested' ? <Clock3 size={14} /> : message.deliveryState === 'failed' ? <CircleX size={13} /> : message.deliveryState === 'unknown' ? <CircleHelp size={13} /> : message.deliveryState === 'delivered' || message.deliveryState === 'read' ? <CheckCheck size={12} /> : <Check size={12} />}{(message.deliveryState === 'failed' || message.deliveryState === 'unknown') && <span>{t(`inbox.delivery.${message.deliveryState}`)}</span>}</div>}
              {!message.isDeleted && message.direction !== 'internal' && <div className="inbox-message-actions">{canSend && message.externalMessageId && <div role="group" aria-label={t('inbox.reactionOptions')} className="inbox-message-quick-reactions">{INBOX_QUICK_EMOJIS.map((emoji) => <button type="button" key={emoji} disabled={reactionBusyMessageId === message.id} aria-label={t('inbox.sendReaction', { emoji })} onClick={() => void sendReaction(message, emoji)}>{emoji}</button>)}</div>}<details className="inbox-message-action-menu"><summary aria-label={t('inbox.messageActions')}><Ellipsis size={17} aria-hidden="true" /></summary><div className="inbox-message-action-menu-items">{canSend && message.externalMessageId && <details className="inbox-message-reaction-menu"><summary><SmilePlus size={15} aria-hidden="true" />{t('inbox.reactToMessage')}</summary><div role="group" aria-label={t('inbox.reactionOptions')}>{INBOX_COMPOSER_EMOJIS.map((emoji, index) => <button key={`${emoji}-${index}`} type="button" disabled={reactionBusyMessageId === message.id} aria-label={t('inbox.sendReaction', { emoji })} onClick={(event) => { const actionMenu = event.currentTarget.closest('.inbox-message-action-menu'); if (actionMenu instanceof HTMLDetailsElement) actionMenu.open = false; void sendReaction(message, emoji) }}>{emoji}</button>)}</div></details>}{canSend && message.bodyText && <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setComposerMode(INBOX_COMPOSER_MODE.reply); setReplyTarget(message); setMessageSendError('') }}><Reply size={15} aria-hidden="true" />{t('inbox.replyToMessage')}</button>}<button type="button" disabled={!message.bodyText && !message.transcriptText} onClick={() => void copyMessage(message)}>{copiedMessageId === message.id ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{copiedMessageId === message.id ? t('inbox.messageCopied') : t('inbox.copyMessage')}</button><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void hideMessage(message) }}><X size={15} aria-hidden="true" />{t('inbox.hideMessage')}</button></div></details></div>}
            </article></Fragment>})}</>}</>}
          </div>{showScrollButton && <button type="button" className="inbox-scroll-to-bottom" aria-label={t('inbox.scrollToBottom')} onClick={() => { const c = messagesContainerRef.current; if (c) c.scrollTop = c.scrollHeight; setShowScrollButton(false); setScrollAwayCount(0) }}><ChevronDown size={17} aria-hidden="true" />{scrollAwayCount > 0 && <span className="inbox-scroll-to-bottom-badge">{scrollAwayCount}</span>}</button>}</div>
          <form className="inbox-composer" onSubmit={sendMessage}>
            <div className="inbox-composer-header"><div className="inbox-composer-modes" role="group" aria-label={t('inboxComposer.composerMode')}><Button type="button" className={composerMode === INBOX_COMPOSER_MODE.reply ? 'active reply-active' : ''} aria-pressed={composerMode === INBOX_COMPOSER_MODE.reply} onClick={() => { setComposerMode(INBOX_COMPOSER_MODE.reply); setMessageSendError(''); messageDraftRef.current?.focus() }} disabled={sendingMessage}><MessageSquareText size={15} aria-hidden="true" />{t('inboxComposer.replyMode')}</Button><Button type="button" className={composerMode === INBOX_COMPOSER_MODE.note ? 'active note-active' : ''} aria-pressed={composerMode === INBOX_COMPOSER_MODE.note} onClick={() => { setComposerMode(INBOX_COMPOSER_MODE.note); setMessageSendError(''); messageDraftRef.current?.focus() }} disabled={sendingMessage || Boolean(mediaDraft) || contactMode}><ClipboardList size={15} aria-hidden="true" />{t('inboxComposer.noteMode')}</Button></div><span className={`inbox-composer-visibility ${composerMode === INBOX_COMPOSER_MODE.note ? 'is-private' : ''}`}>{t(composerMode === INBOX_COMPOSER_MODE.note ? 'inboxComposer.noteVisibility' : 'inboxComposer.replyVisibility')}</span></div>
            {composerMode === INBOX_COMPOSER_MODE.reply && !canSend && <p className="inbox-composer-notice" role="status">{t('inbox.replyUnavailable')}</p>}
            {composerMode === INBOX_COMPOSER_MODE.note && !canAddNote && <p className="inbox-composer-notice is-private" role="status">{t('inboxComposer.noteUnavailable')}</p>}
            {replyTarget && composerMode === INBOX_COMPOSER_MODE.reply && <div className="inbox-reply-target"><span><strong>{t('inbox.replyingTo')}</strong>{replyTarget.bodyText != null ? (replyTarget.bodyText.length > 100 ? replyTarget.bodyText.slice(0, 100) + '…' : replyTarget.bodyText) : t('inbox.nonTextMessage')}</span><IconButton label={t('inbox.cancelReply')} onClick={() => setReplyTarget(null)}><X size={14} /></IconButton></div>}
            <TextareaField ref={messageDraftRef} value={messageDraft} onBlur={() => stopTypingPresence()} onChange={(event) => { const draft = event.target.value; messageDraftLiveRef.current = draft; if (selectedId) { if (draft) draftsByConversationRef.current.set(selectedId, draft); else draftsByConversationRef.current.delete(selectedId) } setMessageDraft(draft); updateTypingPresence(draft); setMessageSendError(mediaDraft?.type.startsWith(INBOX_AUDIO_MIME_PREFIX) && draft.trim() ? t('inboxComposer.audioCaptionUnsupported') : '') }} onKeyDown={(event) => { if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return; event.preventDefault(); event.currentTarget.form?.requestSubmit() }} maxLength={4096} placeholder={t(composerMode === INBOX_COMPOSER_MODE.note ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} disabled={(composerMode === INBOX_COMPOSER_MODE.reply ? !canSend : !canAddNote) || sendingMessage || contactMode} aria-label={t(composerMode === INBOX_COMPOSER_MODE.note ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} />
            {composerMode === INBOX_COMPOSER_MODE.reply && <div className="inbox-composer-tools"><details ref={composerEmojiPickerRef} className="inbox-composer-emoji-picker" onKeyDown={(event) => { if (event.key === 'Escape') { composerEmojiPickerRef.current && (composerEmojiPickerRef.current.open = false); event.preventDefault(); event.stopPropagation() } }}><summary aria-label={t('inboxComposer.insertEmoji')}><Smile size={17} aria-hidden="true" /></summary><div className="inbox-composer-emoji-grid" role="group" aria-label={t('inboxComposer.emojiOptions')} onKeyDown={(event) => { const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')]; const idx = buttons.indexOf(event.target as HTMLButtonElement); if (idx === -1) return; const cols = 8; const delta: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }; if (event.key in delta) { event.preventDefault(); buttons[(idx + delta[event.key]! + buttons.length) % buttons.length]?.focus() } }}>{INBOX_COMPOSER_EMOJIS.map((emoji, index) => <button key={index} type="button" aria-label={t('inboxComposer.emojiOption', { emoji })} onClick={() => insertComposerEmoji(emoji)}>{emoji}</button>)}</div></details><input ref={attachmentInputRef} type="file" accept={INBOX_ATTACHMENT_ACCEPT} hidden onChange={selectMedia} /><Button type="button" className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || contactMode} onClick={() => void draftReplyWithAssistant()}><Sparkles size={15} />{draftingReply ? t('inboxComposer.aiDrafting') : t('inboxComposer.aiDraft')}</Button><Button type="button" className="inbox-media-action" disabled={!canSend || assistantConsultLoading || contactMode} onClick={() => { setAssistantConsultMode(ASSISTANT_CONVERSATION_ASSIST_MODE.summary); setAssistantQuestion(''); setAssistantQuestionValidationAttempted(false); setAssistantConsultResult(null); setAssistantConsultError(false); setAssistantConsultOpen(true) }}><MessageSquareText size={15} />{t('inboxComposer.aiConsult')}</Button><IconButton className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || contactMode || Boolean(mediaDraft)} onClick={() => attachmentInputRef.current?.click()} label={t('inboxComposer.attachFile')}><Paperclip size={17} aria-hidden="true" /></IconButton><IconButton className={`inbox-media-action${audioRecording ? ' is-recording' : ''}`} disabled={!canSend || sendingMessage || draftingReply || contactMode || Boolean(mediaDraft)} onClick={() => audioRecording ? stopAudioRecording() : void startAudioRecording()} aria-pressed={audioRecording} label={t(audioRecording ? 'inboxComposer.stopAudioRecording' : 'inboxComposer.sendAudio')}>{audioRecording ? <Square size={16} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}</IconButton><Button type="button" className="inbox-media-action" disabled={!canSend || sendingMessage || draftingReply || Boolean(mediaDraft)} onClick={() => { setContactMode((active) => !active); setContactDraft({ fullName: '', phoneNumber: '', organization: '', email: '', url: '' }); setMessageDraft(''); setMessageSendError('') }}><UserRound size={15} />{t(contactMode ? 'inboxComposer.cancelContact' : 'inboxComposer.attachContact')}</Button>{mediaDraft && <span className="inbox-media-selection"><span>{mediaDraft.type.startsWith(INBOX_AUDIO_MIME_PREFIX) ? <Mic size={14} /> : <Paperclip size={14} />}{mediaDraft.name}</span><small>{(mediaDraft.size / 1024 / 1024).toFixed(1)} MiB</small><IconButton label={t('inboxComposer.removeAttachment')} disabled={sendingMessage} onClick={() => { setMediaDraft(null); setMessageSendError('') }}><X size={15} /></IconButton></span>}</div>}
            {audioRecording && <div className="inbox-audio-recording" role="status" aria-label={t('inboxComposer.audioRecordingInProgress')}><span className="inbox-audio-recording-live"><i aria-hidden="true" />{t('inboxComposer.audioRecordingInProgress')}</span><div className="inbox-audio-waveform" aria-hidden="true">{audioRecordingWaveform.map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div><time>{formatAudioTime(audioRecordingDuration)}</time></div>}
            {mediaDraft?.type.startsWith(INBOX_AUDIO_MIME_PREFIX) && <div className="inbox-audio-preview"><span>{t("inbox.audioPreview")}</span><InboxAudioPlayer file={mediaDraft} label={mediaDraft.name} compact /></div>}
            {contactMode && <div className="inbox-contact-draft"><label>{t('inboxComposer.contactName')}<TextField required maxLength={160} value={contactDraft.fullName} onChange={(event) => setContactDraft((current) => ({ ...current, fullName: event.target.value }))} /></label><label>{t('inboxComposer.contactPhone')}<PhoneField required value={contactDraft.phoneNumber} onValueChange={(value) => setContactDraft((current) => ({ ...current, phoneNumber: value }))} placeholder="+55 11 99999-0000" requireInternational /></label><label>{t('inboxComposer.contactOrganization')}<TextField maxLength={160} value={contactDraft.organization} onChange={(event) => setContactDraft((current) => ({ ...current, organization: event.target.value }))} /></label><label>{t('inboxComposer.contactEmail')}<TextField type="email" maxLength={254} value={contactDraft.email} onChange={(event) => setContactDraft((current) => ({ ...current, email: event.target.value }))} /></label><label>{t('inboxComposer.contactUrl')}<TextField type="url" maxLength={2048} value={contactDraft.url} onChange={(event) => setContactDraft((current) => ({ ...current, url: event.target.value }))} placeholder="https://" /></label></div>}
            {messageSendError && <div className="inbox-send-error" role="status"><p>{messageSendError}</p>{unknownDeliveryPending && <Button type="button" disabled={sendingMessage} onClick={() => { setMessageKey(crypto.randomUUID()); setUnknownDeliveryPending(false); setMessageSendError('') }}>{t('inboxRetry.prepareResend')}</Button>}</div>}
            <div className={`inbox-composer-submit ${composerMode === INBOX_COMPOSER_MODE.note ? 'is-private' : ''}`}><small>{contactMode ? '' : `${messageDraft.length}/4096`}</small><Button type="submit" disabled={(composerMode === INBOX_COMPOSER_MODE.reply ? !canSend : !canAddNote) || sendingMessage || unknownDeliveryPending || (!contactMode && !messageDraft.trim() && !mediaDraft) || (contactMode && (!contactDraft.fullName.trim() || !contactDraft.phoneNumber.trim())) || (mediaDraft?.type.startsWith(INBOX_AUDIO_MIME_PREFIX) && Boolean(messageDraft.trim()))}>{sendingMessage ? t('inbox.sending') : t(composerMode === INBOX_COMPOSER_MODE.note ? 'inboxComposer.addNote' : 'inbox.send')}<Send size={15} aria-hidden="true" /></Button></div>
          </form>
        </>}
      </section>

      <aside ref={conversationQueueRef} className="inbox-conversations" aria-label={t('inbox.conversationList')}>
        <div className="inbox-conversation-list-heading"><div><h3>{t('inbox.recentConversations')}</h3><span>{t('inbox.conversationCount', { count: conversationTotal })}</span></div><MessageSquareText size={17} /></div>
        <div className="inbox-quick-views" role="group" aria-label={t('inboxQuickViews.label')}>
          {(['all', 'mine', 'unassigned', 'unread'] as const).map((view) => <Button key={view} type="button" className={quickView === view ? 'selected' : ''} aria-pressed={quickView === view} disabled={view === 'mine' && !currentUserId} onClick={() => applyQuickView(view)}>{t(`inboxQuickViews.${view}`)}</Button>)}
        </div>
        <div className="inbox-conversation-filters"><label className="inbox-channel-filter">{t('inbox.searchConversations')}<span className="inbox-search-input-wrap"><TextField value={conversationSearch} onChange={(event) => { setConversationSearch(event.target.value); setOffset(0) }} maxLength={120} placeholder={t('inbox.searchPlaceholder')} />{conversationSearch && <button type="button" className="inbox-search-clear" aria-label={t('inbox.clearSearch')} onClick={() => { setConversationSearch(''); setOffset(0) }}><X size={15} aria-hidden="true" /></button>}</span></label><button type="button" className={`inbox-filter-toggle ${filtersOpen ? 'is-open' : ''}`} aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={16} aria-hidden="true" /><span>{t(filtersOpen ? 'inbox.hideFilters' : 'inbox.showFilters')}</span>{activeAdvancedFilterCount > 0 && <span className="inbox-filter-count">{activeAdvancedFilterCount}</span>}</button>
          {filtersOpen && <div className="inbox-advanced-filters"><label className="inbox-channel-filter">{t('businessLines.title')}<SelectField value={businessLineFilter} onChange={(event) => { const nextLineId = event.target.value; setBusinessLineFilter(nextLineId); setChannelFilter(''); setOffset(0); setSearchParams((current) => { const next = new URLSearchParams(current); if (nextLineId) next.set('businessLineId', nextLineId); else next.delete('businessLineId'); return next }) }}><option value="">{t('businessLines.allLines')}</option>{businessLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('inbox.filterStatus')}<SelectField value={statusFilter} onChange={(event) => { setStatusFilter((['open','pending','resolved','snoozed'] as const).find((status) => status === event.target.value) ?? ''); setOffset(0) }}><option value="">{t('inbox.allStatuses')}</option>{(['open','pending','resolved','snoozed'] as const).map((status) => <option key={status} value={status}>{t(`inbox.status.${status}`)}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('inbox.filterOwner')}<SelectField value={ownerFilter} onChange={(event) => { setOwnerFilter(event.target.value); setOffset(0) }}><option value="">{t('inbox.allOwners')}</option><option value="unassigned">{t('inbox.unassigned')}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('channels.inboxFilter')}<SelectField value={channelFilter} onChange={(event) => { setChannelFilter(event.target.value); setOffset(0) }} disabled={sendingMessage}><option value="">{t('channels.allInboxChannels')}</option>{channels.filter((channel) => !businessLineFilter || channel.businessLineId === businessLineFilter).map((channel) => <option key={channel.id} value={channel.id}>{channel.displayName} · {channel.phoneNumber}</option>)}</SelectField></label>
            <label className="inbox-channel-filter"><span className="inbox-tag-filter-label"><span style={{ background: tags.find((tag) => tag.id === tagFilter)?.color ?? undefined }} aria-hidden="true" />{t('inboxComposer.tagFilter')}</span><SelectField value={tagFilter} onChange={(event) => { setTagFilter(event.target.value); setOffset(0) }} disabled={sendingMessage}><option value="">{t('inboxComposer.allTags')}</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</SelectField></label>
            <label className="inbox-unread-filter"><CheckboxField checked={unreadOnly} onChange={(event) => { setUnreadOnly(event.target.checked); setOffset(0) }} />{t('inbox.unreadOnly')}</label>
            {hasConversationFilters && <Button type="button" className="inbox-clear-all-filters" onClick={clearConversationFilters}>{t('inbox.clearConversationFilters')}</Button>}
          </div>}
        </div>
        <div className="inbox-conversation-items">
        {loading && conversations.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
        {error && conversations.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')}><Button type="button" onClick={() => void refresh()}>{t('platform.retry')}</Button></WorkspaceState>}
        {loading && conversations.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : conversations.length === 0 ? error ? <WorkspaceState kind="error" compact message={error}><Button type="button" onClick={() => void refresh()}>{t('platform.retry')}</Button></WorkspaceState> : <WorkspaceState kind="empty" compact message={hasConversationFilters ? t('inbox.noMatchingConversations') : t('inbox.empty')} detail={hasConversationFilters ? t('inbox.noMatchesHint') : t('inbox.emptyHint')}>{hasConversationFilters && <Button type="button" onClick={clearConversationFilters}>{t('inbox.clearConversationFilters')}</Button>}</WorkspaceState> : conversations.map((conversation) => {
          const label = conversation.conversationType === 'group' ? getGroupConversationName(conversation.displayName, t('inbox.groupConversation')) : conversation.personName ?? conversation.accountName ?? t('inbox.unknownContact')
          return <Button key={conversation.id} className={`inbox-conversation ${conversation.id === selectedId ? 'selected' : ''} ${conversation.unread ? 'unread' : ''}`} onClick={() => selectConversation(conversation.id)} aria-pressed={conversation.id === selectedId} disabled={sendingMessage}>
            <InboxConversationAvatar conversationId={conversation.id} label={label} enabled={conversation.provider === 'evolution' && conversation.conversationType === 'direct'} /><span className="inbox-conversation-copy"><span className="inbox-conversation-topline"><strong>{label}</strong>{conversation.lastMessageAt && <time dateTime={conversation.lastMessageAt}>{new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(new Date(conversation.lastMessageAt))}</time>}</span><small>{conversation.conversationType === 'group' ? conversation.lastMessageAuthorName ?? conversation.lastMessageAuthorPhone ?? t('inbox.groupConversation') : conversation.personPhone ?? '—'}</small><span className="inbox-conversation-preview">{conversation.lastMessageDirection === 'outbound' && <span className={`inbox-list-ticks ${conversation.lastMessageDeliveryState === 'read' ? 'is-read' : ''}`} aria-label={t(`inbox.delivery.${conversation.lastMessageDeliveryState ?? 'unknown'}`)}>{conversation.lastMessageDeliveryState === 'requested' ? <Clock3 size={13} /> : conversation.lastMessageDeliveryState === 'delivered' || conversation.lastMessageDeliveryState === 'read' ? <CheckCheck size={14} /> : <Check size={14} />}</span>}{conversation.lastMessagePreviewKind === 'encrypted_reaction' ? t('inbox.encryptedReactionPreview') : conversation.lastMessagePreview ?? (conversation.lastMessagePreviewKind === 'non_text' ? t('inbox.mediaPreview') : t('inbox.noMessagesYet'))}</span></span>{conversation.unread && <span className="inbox-unread-indicator" aria-label={t('inbox.unread')} />}
          </Button>
        })}
        </div>
        <div className="inbox-list-pagination"><div className="inbox-pagination-summary"><span>{conversationTotal === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, conversationTotal)} / {conversationTotal}</span><label>{t('table.rowsPerPage')}<SelectField value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></SelectField></label></div><div className="inbox-pagination-controls"><Button type="button" aria-label={t('table.previous')} disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}><ChevronLeft size={16} aria-hidden="true" /></Button><Button type="button" aria-label={t('table.next')} disabled={loading || offset + pageSize >= conversationTotal} onClick={() => setOffset(offset + pageSize)}><ChevronRight size={16} aria-hidden="true" /></Button></div></div>
      </aside>


    </div>
    <Modal open={reconcileOpen} onOpenChange={setReconcileOpen} title={t('inbox.contactReconciliation.title')} description={t('inbox.contactReconciliation.description')} closeLabel={t('common.close')}>
      <form className="inbox-contact-reconcile-form" onSubmit={saveContactReconciliation}>
        <label>{t('inbox.contactReconciliation.lead')}<TextField value={leadSearch} onChange={(event) => { setLeadSearch(event.target.value); setReconcileLeadId(''); setReconcileLead(null) }} maxLength={120} placeholder={t('inbox.contactReconciliation.search')} /></label>
        {leadSearchLoading && <WorkspaceState kind="loading" compact message={t('inbox.contactReconciliation.searching')} />}
        {leadSearchFailed && <WorkspaceState kind="error" compact message={t('inbox.contactReconciliation.searchFailed')} />}
        {!leadSearchLoading && !leadSearchFailed && leadSearch.trim().length >= 2 && leadOptions.length === 0 && <WorkspaceState kind="empty" compact message={t('inbox.contactReconciliation.noResults')} />}
        {leadOptions.length > 0 && <div className="inbox-contact-reconcile-options" role="group" aria-label={t('inbox.contactReconciliation.results')}>{leadOptions.map((lead) => <Button key={lead.id} type="button" className={reconcileLeadId === lead.id ? 'active' : ''} aria-pressed={reconcileLeadId === lead.id} onClick={() => { setReconcileLeadId(lead.id); setReconcileLead(lead) }}>{lead.accountName} · {lead.contactName ?? t('inbox.unknownContact')}</Button>)}</div>}
        {reconcileLead && <p className="inbox-contact-reconcile-selected"><strong>{t('inbox.contactReconciliation.selectedLead')}:</strong> {reconcileLead.accountName} · {reconcileLead.contactName ?? t('inbox.unknownContact')}</p>}
        <label>{t('inbox.contactReconciliation.name')}<TextField value={confirmedName} onChange={(event) => setConfirmedName(event.target.value)} maxLength={160} /></label>
        <label>{t('inbox.contactReconciliation.phone')}<PhoneField value={confirmedPhone} onValueChange={setConfirmedPhone} placeholder="+55 11 99999-0000" requireInternational /></label>
        <div className="inbox-contact-reconcile-flags"><label><CheckboxField checked={markAsPrimary} onChange={(event) => setMarkAsPrimary(event.target.checked)} />{t('inbox.contactReconciliation.markPrimary')}</label><label><CheckboxField checked={markAsInterested} onChange={(event) => setMarkAsInterested(event.target.checked)} />{t('inbox.contactReconciliation.markInterested')}</label></div>
        {reconcileError && <WorkspaceState kind="error" compact message={reconcileError} />}
        <Button type="submit" disabled={reconciling || !reconcileLeadId || confirmedName.trim().length < 2}>{reconciling ? t('common.saving') : t('inbox.contactReconciliation.save')}</Button>
      </form>
    </Modal>
    <Modal open={contactDetailsEditOpen} onOpenChange={setContactDetailsEditOpen} title={t('inbox.contactNameEdit.title')} description={t('inbox.contactNameEdit.description')} closeLabel={t('common.close')}>
      <form className="inbox-contact-reconcile-form" onSubmit={saveContactDetails}>
        <label>{t('inbox.contactNameEdit.name')}<TextField value={contactNameDraft} onChange={(event) => { setContactNameDraft(event.target.value); setContactDetailsError('') }} maxLength={160} minLength={2} required /></label>
        <label>{t('inbox.contactNameEdit.email')}<TextField type="email" value={contactEmailDraft} onChange={(event) => { setContactEmailDraft(event.target.value); setContactDetailsError('') }} maxLength={254} /></label>
        {contactDetailsError && <WorkspaceState kind="error" compact message={contactDetailsError} />}
        <Button type="submit" disabled={contactDetailsSaving || contactNameDraft.trim().length < 2}>{contactDetailsSaving ? t('common.saving') : t('inbox.contactNameEdit.save')}</Button>
      </form>
    </Modal>
    <Modal open={opportunityOpen} onOpenChange={setOpportunityOpen} title={t('inbox.opportunityCreation.title')} description={t('inbox.opportunityCreation.description')} closeLabel={t('common.close')}>
      <form className="inbox-contact-reconcile-form" onSubmit={saveOpportunityFromConversation}>
        <label>{t('inbox.contactReconciliation.lead')}<TextField value={leadSearch} onChange={(event) => { setLeadSearch(event.target.value); setReconcileLeadId(''); setReconcileLead(null) }} maxLength={120} placeholder={t('inbox.contactReconciliation.search')} /></label>
        {leadSearchLoading && <WorkspaceState kind="loading" compact message={t('inbox.contactReconciliation.searching')} />}
        {leadSearchFailed && <WorkspaceState kind="error" compact message={t('inbox.contactReconciliation.searchFailed')} />}
        {!leadSearchLoading && !leadSearchFailed && leadSearch.trim().length >= 2 && leadOptions.length === 0 && <WorkspaceState kind="empty" compact message={t('inbox.contactReconciliation.noResults')} />}
        {leadOptions.length > 0 && <div className="inbox-contact-reconcile-options" role="group" aria-label={t('inbox.contactReconciliation.results')}>{leadOptions.map((lead) => <Button key={lead.id} type="button" className={reconcileLeadId === lead.id ? 'active' : ''} aria-pressed={reconcileLeadId === lead.id} onClick={() => { setReconcileLeadId(lead.id); setReconcileLead(lead); setOpportunityError('') }}>{lead.accountName} · {lead.contactName ?? t('inbox.unknownContact')}</Button>)}</div>}
        {reconcileLead && <p className="inbox-contact-reconcile-selected"><strong>{t('inbox.contactReconciliation.selectedLead')}:</strong> {reconcileLead.accountName} · {reconcileLead.contactName ?? t('inbox.unknownContact')}</p>}
        <Button type="button" disabled={!reconcileLeadId || opportunityGenerating} onClick={() => void generateOpportunityContext()}><Sparkles size={15} />{opportunityGenerating ? t('inbox.opportunityCreation.generating') : t('inbox.opportunityCreation.generate')}</Button>
        <label>{t('inbox.opportunityCreation.summary')}<TextareaField value={opportunitySummary} onChange={(event) => setOpportunitySummary(event.target.value)} maxLength={8000} /></label>
        {opportunityFacts.length > 0 && <div><strong>{t('inbox.opportunityCreation.facts')}</strong><ul>{opportunityFacts.map((fact, index) => <li key={`${index}-${fact}`}>{fact}</li>)}</ul></div>}
        {opportunityUnknowns.length > 0 && <div><strong>{t('inbox.opportunityCreation.unknowns')}</strong><ul>{opportunityUnknowns.map((fact, index) => <li key={`${index}-${fact}`}>{fact}</li>)}</ul></div>}
        <label>{t('inbox.opportunityCreation.nextAction')}<TextField value={opportunityNextAction} onChange={(event) => setOpportunityNextAction(event.target.value)} maxLength={500} /></label>
        <label>{t('inbox.opportunityCreation.dueAt')}<input className="inbox-opportunity-due" type="datetime-local" value={opportunityDueAt} onChange={(event) => setOpportunityDueAt(event.target.value)} required /></label>
        {opportunityError && <WorkspaceState kind="error" compact message={opportunityError} />}
        <Button type="submit" disabled={opportunitySaving || !reconcileLeadId || opportunitySummary.trim().length < 10 || opportunityNextAction.trim().length < 3 || !opportunityDueAt}>{opportunitySaving ? t('common.saving') : t('inbox.opportunityCreation.save')}</Button>
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
