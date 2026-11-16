import { Button, CheckboxField, SelectField, TextField, TextareaField } from '../components/ui/FormControls'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Building2, CalendarClock, ClipboardList, Download, Mail, MessageSquareText, Paperclip, Phone, RefreshCw, SlidersHorizontal, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type ChannelDto, type ConversationDto, type MessageAttachmentDto, type MessageDto } from '../lib/api/client'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import i18n from '../lib/i18n'
import './InboxWorkspace.css'
import './InboxAttachments.css'

export function InboxWorkspace({ initialSearch = '', initialConversationId = '' }: { initialSearch?: string; initialConversationId?: string }) {
  const { t } = useTranslation()
  const [conversations, setConversations] = useState<ConversationDto[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<MessageDto[]>([])
  const [messagesConversationId, setMessagesConversationId] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply')
  const [tagFilter, setTagFilter] = useState('')
  const [tagDraft, setTagDraft] = useState('')
  const [tags, setTags] = useState<Array<{ id: string; name: string }>>([])
  const [tagBusy, setTagBusy] = useState(false)
  const [messageKey, setMessageKey] = useState(() => crypto.randomUUID())
  const [sendingMessage, setSendingMessage] = useState(false)
  const [messageSendError, setMessageSendError] = useState('')
  const [channels, setChannels] = useState<ChannelDto[]>([])
  const [assignees, setAssignees] = useState<Array<{ id: string; name: string; role: string }>>([])
  const [assigneeTarget, setAssigneeTarget] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [controlling, setControlling] = useState(false)
  const [channelFilter, setChannelFilter] = useState('')
  const [conversationSearch, setConversationSearch] = useState(initialSearch)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ConversationDto['status'] | ''>('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [conversationIdFilter, setConversationIdFilter] = useState(initialConversationId)
  const [pageSize, setPageSize] = useState(25)
  const [offset, setOffset] = useState(0)
  const [conversationTotal, setConversationTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [error, setError] = useState('')
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
      const result = await api.inbox.conversations({ conversationId: conversationIdFilter || undefined, channelId: channelFilter || undefined, tagId: tagFilter || undefined, status: statusFilter || undefined, ownerUserId: ownerFilter || undefined, search: debouncedSearch || undefined, unreadOnly, limit: pageSize, offset })
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
  }, [conversationIdFilter, channelFilter, tagFilter, statusFilter, ownerFilter, debouncedSearch, unreadOnly, pageSize, offset, t])
  refreshRef.current = refresh

  useEffect(() => { api.inbox.channels().then(setChannels).catch(() => setChannels([])) }, [])
  useEffect(() => { api.inbox.tags().then(setTags).catch(() => setTags([])) }, [])
  useEffect(() => { api.inbox.assignees().then(setAssignees).catch(() => setAssignees([])) }, [])
  useEffect(() => { api.session.get().then((session) => setCurrentUserId(session.user.id)).catch(() => setCurrentUserId('')) }, [])
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(conversationSearch.trim()), 250); return () => window.clearTimeout(timer) }, [conversationSearch])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => { setMessageDraft(''); setMessageKey(crypto.randomUUID()); setMessageSendError(''); setComposerMode('reply') }, [selectedId])
  useEffect(() => {
    if (!selectedId) { setMessages([]); setMessagesConversationId(''); return }
    let active = true
    let requestInFlight = false
    setMessages([])
    setMessagesConversationId('')
    setMessagesLoading(true)
    const loadMessages = async (initial = false) => {
      if (requestInFlight) return
      requestInFlight = true
      try {
        const result = await api.inbox.messages(selectedId, { limit: 100 })
        if (active) {
          setMessages((current) => current.length === result.length && current.every((message, index) => {
            const next = result[index]
            return message.id === next?.id && message.deliveryState === next.deliveryState && message.bodyText === next.bodyText && message.transcriptText === next.transcriptText && JSON.stringify(message.attachments) === JSON.stringify(next.attachments)
          }) ? current : result)
          setMessagesConversationId(selectedId)
        }
      } catch {
        if (active && initial) setError(t('inbox.messagesFailed'))
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
    const stream = api.inbox.subscribe()
    const refreshOnConnect = () => {
      if (document.visibilityState !== 'visible') return
      void refreshRef.current(true)
      refreshMessagesRef.current()
    }
    const refreshOnConversationUpdate = (event: Event) => {
      if (document.visibilityState !== 'visible') return
      void refreshRef.current(true)
      try {
        const update = JSON.parse((event as MessageEvent<string>).data) as { conversationId?: string }
        if (update.conversationId === selectedIdRef.current) refreshMessagesRef.current()
      } catch { /* Ignore malformed event data; the next update will retry the refresh. */ }
    }
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') refreshOnConnect()
    }
    stream.addEventListener('ready', refreshOnConnect)
    stream.addEventListener('conversation.updated', refreshOnConversationUpdate)
    document.addEventListener('visibilitychange', refreshOnReturn)
    return () => {
      stream.close()
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
  const hasConversationFilters = Boolean(conversationIdFilter || channelFilter || tagFilter || statusFilter || ownerFilter || unreadOnly || conversationSearch.trim())
  const clearConversationFilters = () => { setConversationIdFilter(''); setConversationSearch(''); setDebouncedSearch(''); setStatusFilter(''); setOwnerFilter(''); setUnreadOnly(false); setChannelFilter(''); setTagFilter(''); setOffset(0) }
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
    if (!selected || (composerMode === 'reply' ? !canSend : !canAddNote) || !messageDraft.trim()) return
    setSendingMessage(true); setMessageSendError('')
    try {
      const message = composerMode === 'reply'
        ? await api.inbox.sendMessage(selected.id, { bodyText: messageDraft, idempotencyKey: messageKey })
        : await api.inbox.addNote(selected.id, { bodyText: messageDraft, idempotencyKey: messageKey })
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
      setMessageDraft(''); setMessageKey(crypto.randomUUID())
      if (composerMode === 'reply' && message.deliveryState === 'unknown') setMessageSendError(t('inbox.deliveryUnknown'))
      if (composerMode === 'reply' && message.deliveryState === 'failed') setMessageSendError(t('inbox.deliveryFailed'))
    } catch {
      setMessageSendError(t('inbox.sendFailed'))
    } finally { setSendingMessage(false) }
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
  const formatConversationTime = (value: string | null) => {
    if (!value) return t('inbox.noMessagesYet')
    const date = new Date(value)
    const now = new Date()
    const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' }).format(date)
    if (date.toDateString() === now.toDateString()) return `${t('inbox.today')} · ${time}`
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) return `${t('inbox.yesterday')} · ${time}`
    return new Intl.DateTimeFormat(i18n.language, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
  }
  const downloadAttachment = async (attachment: MessageAttachmentDto) => {
    try {
      const content = await api.inbox.downloadAttachment(attachment.id)
      const url = URL.createObjectURL(content)
      const link = document.createElement('a')
      link.href = url; link.download = attachment.fileName ?? t('inbox.attachmentFallback'); link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch { setError(t('inbox.attachmentDownloadFailed')) }
  }

  return <section className="inbox-page">
    <header className="inbox-heading"><div><p className="eyebrow">{t('inbox.eyebrow')}</p><h2>{t('inbox.title')}</h2><p className="muted">{t('inbox.description')}</p></div>
      <Button className="refresh" disabled={sendingMessage} onClick={() => void refresh()} aria-label={t('inbox.refresh')}><RefreshCw size={16} /></Button>
    </header>
    {error && <WorkspaceState kind="error" compact message={error} />}
    <div className="inbox-layout">
      <aside className="inbox-contact-panel" aria-label={t('inbox.leadDetails')}>
        {!selected ? <WorkspaceState kind="empty" compact message={t('inbox.selectConversation')} /> : <>
          <div className="inbox-contact-identity"><span><UserRound size={21} /></span><div><h3>{selected.personName ?? t('inbox.unknownContact')}</h3><p>{selected.accountName ?? t('inbox.noCompany')}</p></div></div>
          <section className="inbox-contact-section"><h4>{t('inbox.contactDetails')}</h4><dl>
            <div><dt><Mail size={14} />{t('inbox.email')}</dt><dd>{selected.personEmail ?? '—'}</dd></div>
            <div><dt><Phone size={14} />{t('inbox.phone')}</dt><dd>{selected.personPhone ?? '—'}</dd></div>
            <div><dt><Building2 size={14} />{t('inbox.company')}</dt><dd>{selected.accountName ?? '—'}</dd></div>
          </dl></section>
          <section className="inbox-contact-section"><h4>{t('inbox.leadContext')}</h4><dl>
            <div><dt>{t('inbox.leadStatus')}</dt><dd>{selected.lead ? t(`leadStatuses.${selected.lead.status}`, { defaultValue: selected.lead.status }) : t('inbox.noLead')}</dd></div>
            <div><dt>{t('inbox.leadSource')}</dt><dd>{selected.lead ? t(`leads.sources.${selected.lead.source}`, { defaultValue: selected.lead.source }) : '—'}</dd></div>
            <div><dt><CalendarClock size={14} />{t('inbox.nextAction')}</dt><dd>{selected.lead?.nextActionAt ? formatDate(selected.lead.nextActionAt) : '—'}</dd></div>
            <div><dt>{t('inbox.owner')}</dt><dd>{selected.ownerName ?? t('inbox.unassigned')}</dd></div>
            <div><dt>{t('inbox.channel')}</dt><dd>{selected.channelName ?? selected.provider}</dd></div>
            <div><dt>{t('inbox.statusLabel')}</dt><dd>{t(`inbox.status.${selected.status}`)}</dd></div>
          </dl></section>
          {selected.assistantQualification && <section className="inbox-qualification" aria-label={t('assistantQualification.title')}><header><ClipboardList size={17} /><strong>{t('assistantQualification.title')}</strong><span>{t(`assistantQualification.intents.${selected.assistantQualification.intent}`)}</span></header><p>{selected.assistantQualification.summary}</p><div className="inbox-qualification-columns"><div><strong>{t('assistantQualification.confirmed')}</strong>{selected.assistantQualification.confirmedFacts.length ? <ul>{selected.assistantQualification.confirmedFacts.map((fact, index) => <li key={`${index}-${fact}`}>{fact}</li>)}</ul> : <p>{t('assistantQualification.none')}</p>}</div><div><strong>{t('assistantQualification.unknowns')}</strong>{selected.assistantQualification.unknowns.length ? <ul>{selected.assistantQualification.unknowns.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>{t('assistantQualification.none')}</p>}</div></div><div className="inbox-qualification-next"><strong>{t('assistantQualification.nextStep')}</strong><p>{selected.assistantQualification.nextStep}</p></div><small>{t('assistantQualification.updated', { date: new Date(selected.assistantQualification.updatedAt).toLocaleString(i18n.language) })}</small></section>}
          <div className="inbox-tag-manager"><strong>{t('inboxComposer.tagsLabel')}</strong><div className="inbox-tag-list">{selected.tags.map((tag) => <span key={tag.id}>{tag.name}{canEditTags && <Button type="button" aria-label={t('inboxComposer.removeTag', { name: tag.name })} disabled={tagBusy} onClick={() => void removeTag(tag.id)}>×</Button>}</span>)}</div>{canEditTags && <div><TextField value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} maxLength={32} placeholder={t('inboxComposer.tagPlaceholder')} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addTag() } }} /><Button type="button" disabled={tagBusy || tagDraft.trim().length < 2} onClick={() => void addTag()}>{tagBusy ? t('common.saving') : t('inboxComposer.addTag')}</Button></div>}</div>
        </>}
      </aside>
      <section className="inbox-thread" aria-label={t('inbox.thread')}>
        {!selected ? <WorkspaceState kind={loading ? 'loading' : 'empty'} message={loading ? t('common.loading') : t('inbox.selectConversation')} detail={t('inbox.readOnly')} /> : <>
          <header className="inbox-thread-heading"><div><strong>{selected.accountName ?? selected.personName ?? t('inbox.unknownContact')}</strong><span>{selected.personName && selected.accountName ? selected.personName : selected.provider}</span>{selected.channelName && <small>{selected.channelName} · {selected.channelPhoneNumber}</small>}<small>{t('inbox.owner')}: {selected.ownerName ?? t('inbox.unassigned')} · {t('inbox.automation')}: {t(`inbox.modes.${selected.automationMode}`)}</small></div><div className="inbox-control-actions">
            {(!selected.ownerUserId || selected.ownerUserId === currentUserId) && assignees.length > 0 && <><label className="inbox-assignee-select"><span>{t('inbox.assignTo')}</span><SelectField value={assigneeTarget} onChange={(event) => setAssigneeTarget(event.target.value)} disabled={controlling}><option value="" disabled>{t('inbox.selectAssignee')}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</SelectField></label><Button type="button" disabled={controlling || !assigneeTarget} onClick={() => void controlConversation('assign')}>{t('inbox.assign')}</Button></>}
            {!selected.ownerUserId && <Button type="button" disabled={controlling} onClick={() => void controlConversation('claim')}>{controlling ? t('inbox.claiming') : t('inbox.claim')}</Button>}
            {selected.ownerUserId === currentUserId && selected.automationMode === 'human' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('pause')}>{t('inbox.pauseAssistant')}</Button>}
            {selected.automationMode === 'paused' && (!selected.ownerUserId || selected.ownerUserId === currentUserId) && <Button type="button" disabled={controlling} onClick={() => void controlConversation('assistant')}>{t('inbox.resumeAssistant')}</Button>}
            {selected.ownerUserId === currentUserId && <Button type="button" disabled={controlling} onClick={() => void controlConversation('release')}>{t('inbox.release')}</Button>}
            {selected.ownerUserId === currentUserId && selected.status !== 'resolved' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('resolve')}>{t('inbox.resolve')}</Button>}
            {selected.ownerUserId === currentUserId && selected.status === 'resolved' && <Button type="button" disabled={controlling} onClick={() => void controlConversation('reopen')}>{t('inbox.reopen')}</Button>}
            <span className="tag">{t(`inbox.status.${selected.status}`)}</span></div></header>
          <div className="inbox-messages" aria-live="polite">
            {messagesLoading ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : messages.length === 0 ? <WorkspaceState kind="empty" compact message={t('inbox.noMessagesYet')} detail={t('inbox.emptyMessagesHint')} /> : messages.map((message) => <article key={message.id} className={`inbox-message ${message.direction}`}>
              <div className="inbox-message-meta"><span>{message.direction === 'internal' ? t('inboxComposer.internalNoteBy', { name: message.actorName ?? t('inbox.actor.user') }) : t(`inbox.actor.${message.actorType}`)}</span><time dateTime={message.occurredAt}>{formatDate(message.occurredAt)}</time></div>
              {message.bodyText ? <p>{message.bodyText}</p> : !message.transcriptText && message.attachments.length === 0 && <p>{t('inbox.nonTextMessage')}</p>}{message.transcriptText && <p className="inbox-transcript"><strong>{t('inbox.transcript')}</strong> {message.transcriptText}</p>}{message.attachments.map((attachment) => <div className="inbox-attachment" key={attachment.id}><Paperclip size={14} /><span>{attachment.fileName ?? t(`inbox.mediaTypes.${attachment.mediaType}`)}<small>{attachment.status === 'available' ? attachment.mimeType ?? t('inbox.attachmentReady') : t(`inbox.attachmentStatus.${attachment.status}`)}</small></span>{attachment.status === 'available' && <Button type="button" aria-label={t('inbox.downloadAttachment', { name: attachment.fileName ?? t(`inbox.mediaTypes.${attachment.mediaType}`) })} onClick={() => void downloadAttachment(attachment)}><Download size={14} />{t('inbox.download')}</Button>}</div>)}{message.direction !== 'internal' && <small>{t(`inbox.delivery.${message.deliveryState}`)}</small>}
            </article>)}
          </div>
          <form className="inbox-composer" onSubmit={sendMessage}>
            <div className="inbox-composer-modes"><Button type="button" className={composerMode === 'reply' ? 'active' : ''} onClick={() => { setComposerMode('reply'); setMessageSendError('') }} disabled={sendingMessage}>{t('inboxComposer.replyMode')}</Button><Button type="button" className={composerMode === 'note' ? 'active' : ''} onClick={() => { setComposerMode('note'); setMessageSendError('') }} disabled={sendingMessage}>{t('inboxComposer.noteMode')}</Button></div>
            {composerMode === 'reply' && !canSend && <p>{t('inbox.replyUnavailable')}</p>}
            {composerMode === 'note' && !canAddNote && <p>{t('inboxComposer.noteUnavailable')}</p>}
            <TextareaField value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={4096} placeholder={t(composerMode === 'note' ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} disabled={(composerMode === 'reply' ? !canSend : !canAddNote) || sendingMessage} aria-label={t(composerMode === 'note' ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} />
            {messageSendError && <p className="inbox-send-error" role="status">{messageSendError}</p>}
            <div><small>{messageDraft.length}/4096</small><Button type="submit" disabled={(composerMode === 'reply' ? !canSend : !canAddNote) || sendingMessage || !messageDraft.trim()}>{sendingMessage ? t('inbox.sending') : t(composerMode === 'note' ? 'inboxComposer.addNote' : 'inbox.send')}</Button></div>
          </form>
          <footer className="inbox-readonly-note">{t('inbox.readOnly')}</footer>
        </>}
      </section>

      <aside className="inbox-conversations" aria-label={t('inbox.conversationList')}>
        <div className="inbox-conversation-list-heading"><div><h3>{t('inbox.recentConversations')}</h3><span>{t('inbox.conversationCount', { count: conversationTotal })}</span></div><MessageSquareText size={17} /></div>
        <div className="inbox-conversation-filters"><label className="inbox-channel-filter">{t('inbox.searchConversations')}<TextField value={conversationSearch} onChange={(event) => { setConversationSearch(event.target.value); setOffset(0) }} maxLength={120} placeholder={t('inbox.searchPlaceholder')} /></label><Button className="inbox-filter-toggle" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={15} />{t(filtersOpen ? 'inbox.hideFilters' : 'inbox.showFilters')}</Button>
          {filtersOpen && <div className="inbox-advanced-filters"><label className="inbox-channel-filter">{t('inbox.filterStatus')}<SelectField value={statusFilter} onChange={(event) => { setStatusFilter((['open','pending','resolved','snoozed'] as const).find((status) => status === event.target.value) ?? ''); setOffset(0) }}><option value="">{t('inbox.allStatuses')}</option>{(['open','pending','resolved','snoozed'] as const).map((status) => <option key={status} value={status}>{t(`inbox.status.${status}`)}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('inbox.filterOwner')}<SelectField value={ownerFilter} onChange={(event) => { setOwnerFilter(event.target.value); setOffset(0) }}><option value="">{t('inbox.allOwners')}</option><option value="unassigned">{t('inbox.unassigned')}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('channels.inboxFilter')}<SelectField value={channelFilter} onChange={(event) => { setChannelFilter(event.target.value); setOffset(0) }} disabled={sendingMessage}><option value="">{t('channels.allInboxChannels')}</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.displayName} · {channel.phoneNumber}</option>)}</SelectField></label>
            <label className="inbox-channel-filter">{t('inboxComposer.tagFilter')}<SelectField value={tagFilter} onChange={(event) => { setTagFilter(event.target.value); setOffset(0) }} disabled={sendingMessage}><option value="">{t('inboxComposer.allTags')}</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</SelectField></label>
            {conversationIdFilter && <Button type="button" onClick={clearConversationFilters}>{t('inbox.clearConversationFilters')}</Button>}
          </div>}
          <label className="inbox-unread-filter"><CheckboxField checked={unreadOnly} onChange={(event) => { setUnreadOnly(event.target.checked); setOffset(0) }} />{t('inbox.unreadOnly')}</label>
        </div>
        <div className="inbox-conversation-items">
        {loading && conversations.length > 0 && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
        {loading && conversations.length === 0 ? <WorkspaceState kind="loading" compact message={t('common.loading')} /> : conversations.length === 0 ? error ? <WorkspaceState kind="error" compact message={error} /> : <WorkspaceState kind="empty" compact message={hasConversationFilters ? t('inbox.noMatchingConversations') : t('inbox.empty')} detail={hasConversationFilters ? t('inbox.noMatchesHint') : t('inbox.emptyHint')}>{hasConversationFilters && <Button type="button" onClick={clearConversationFilters}>{t('inbox.clearConversationFilters')}</Button>}</WorkspaceState> : conversations.map((conversation) => {
          const label = conversation.accountName ?? conversation.personName ?? t('inbox.unknownContact')
          return <Button key={conversation.id} className={`inbox-conversation ${conversation.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(conversation.id)} aria-pressed={conversation.id === selectedId} disabled={sendingMessage}>
            <span className="inbox-avatar"><MessageSquareText size={17} /></span><span className="inbox-conversation-copy"><strong>{label}</strong>{conversation.unread && <span className="inbox-unread-badge">{t('inbox.unread')}</span>}<small>{conversation.personName && conversation.accountName ? conversation.personName : conversation.channelName ?? conversation.provider}</small><small>{conversation.channelPhoneNumber ?? ''}{conversation.channelPhoneNumber ? ' · ' : ''}{conversation.ownerName ?? t('inbox.unassigned')}</small>{conversation.tags.length > 0 && <span className="inbox-tag-list">{conversation.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</span>}<small className="inbox-conversation-time">{formatConversationTime(conversation.lastMessageAt ?? conversation.createdAt)}</small><small>{t(`inbox.status.${conversation.status}`)} · {t(`inbox.modes.${conversation.automationMode}`)}</small></span>
          </Button>
        })}
        </div>
        <div className="inbox-list-pagination"><div className="inbox-pagination-summary"><span>{conversationTotal === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, conversationTotal)} / {conversationTotal}</span><label>{t('table.rowsPerPage')}<SelectField value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></SelectField></label></div><div className="inbox-pagination-controls"><Button type="button" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>{t('table.previous')}</Button><Button type="button" disabled={loading || offset + pageSize >= conversationTotal} onClick={() => setOffset(offset + pageSize)}>{t('table.next')}</Button></div></div>
      </aside>


    </div>
  </section>
}
