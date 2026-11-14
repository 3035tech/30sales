import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageSquareText, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type ChannelDto, type ConversationDto, type MessageDto } from '../lib/api/client'
import i18n from '../lib/i18n'
import './InboxWorkspace.css'

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

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current
    setLoading(true)
    setError('')
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
      if (sequence !== refreshSequence.current) return
      setError(t('inbox.loadFailed'))
    } finally {
      if (sequence === refreshSequence.current) setLoading(false)
    }
  }, [conversationIdFilter, channelFilter, tagFilter, statusFilter, ownerFilter, debouncedSearch, unreadOnly, pageSize, offset, t])

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
    setMessages([])
    setMessagesConversationId('')
    setMessagesLoading(true)
    api.inbox.messages(selectedId, { limit: 100 }).then((result) => { if (active) { setMessages(result); setMessagesConversationId(selectedId) } })
      .catch(() => { if (active) setError(t('inbox.messagesFailed')) })
      .finally(() => { if (active) setMessagesLoading(false) })
    return () => { active = false }
  }, [selectedId, t])
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
  const controlConversation = async (action: 'claim' | 'release' | 'sofia' | 'pause' | 'assign') => {
    if (!selected) return
    setControlling(true)
    setError('')
    try {
      if (action === 'claim') await api.inbox.claim(selected.id)
      else if (action === 'release') await api.inbox.release(selected.id)
      else if (action === 'assign') await api.inbox.assign(selected.id, assigneeTarget)
      else await api.inbox.setAutomationMode(selected.id, action === 'sofia' ? 'sofia' : 'paused')
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

  return <section className="inbox-page">
    <header className="inbox-heading"><div><p className="eyebrow">{t('inbox.eyebrow')}</p><h2>{t('inbox.title')}</h2><p className="muted">{t('inbox.description')}</p></div>
      <button className="refresh" disabled={sendingMessage} onClick={() => void refresh()} aria-label={t('inbox.refresh')}><RefreshCw size={16} /></button>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="inbox-layout">
      <aside className="inbox-conversations" aria-label={t('inbox.conversationList')}>
        <label className="inbox-channel-filter">{t('inbox.searchConversations')}<input value={conversationSearch} onChange={(event) => { setConversationSearch(event.target.value); setOffset(0) }} maxLength={120} placeholder={t('inbox.searchPlaceholder')} /></label>
        <label className="inbox-channel-filter">{t('inbox.filterStatus')}<select value={statusFilter} onChange={(event) => { setStatusFilter((['open','pending','resolved','snoozed'] as const).find((status) => status === event.target.value) ?? ''); setOffset(0) }}><option value="">{t('inbox.allStatuses')}</option>{(['open','pending','resolved','snoozed'] as const).map((status) => <option key={status} value={status}>{t(`inbox.status.${status}`)}</option>)}</select></label>
        <label className="inbox-channel-filter">{t('inbox.filterOwner')}<select value={ownerFilter} onChange={(event) => { setOwnerFilter(event.target.value); setOffset(0) }}><option value="">{t('inbox.allOwners')}</option><option value="unassigned">{t('inbox.unassigned')}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select></label>
        <label className="inbox-unread-filter"><input type="checkbox" checked={unreadOnly} onChange={(event) => { setUnreadOnly(event.target.checked); setOffset(0) }} />{t('inbox.unreadOnly')}</label>
        <label className="inbox-channel-filter">{t('channels.inboxFilter')}<select value={channelFilter} onChange={(event) => { setChannelFilter(event.target.value); setOffset(0) }} disabled={sendingMessage}><option value="">{t('channels.allInboxChannels')}</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.displayName} · {channel.phoneNumber}</option>)}</select></label>
        <label className="inbox-channel-filter">{t('inboxComposer.tagFilter')}<select value={tagFilter} onChange={(event) => { setTagFilter(event.target.value); setOffset(0) }} disabled={sendingMessage}><option value="">{t('inboxComposer.allTags')}</option>{tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label>
        {conversationIdFilter && <button type="button" onClick={clearConversationFilters}>{t('inbox.clearConversationFilters')}</button>}
        {loading ? <p className="inbox-empty">{t('common.loading')}</p> : conversations.length === 0 ? <div className="inbox-empty"><MessageSquareText size={22} /><strong>{hasConversationFilters ? t('inbox.noMatchingConversations') : t('inbox.empty')}</strong><span>{hasConversationFilters ? t('inbox.noMatchesHint') : t('inbox.emptyHint')}</span>{hasConversationFilters && <button type="button" onClick={clearConversationFilters}>{t('inbox.clearConversationFilters')}</button>}</div> : conversations.map((conversation) => {
          const label = conversation.accountName ?? conversation.personName ?? t('inbox.unknownContact')
          return <button key={conversation.id} className={`inbox-conversation ${conversation.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(conversation.id)} aria-pressed={conversation.id === selectedId} disabled={sendingMessage}>
            <span className="inbox-avatar"><MessageSquareText size={17} /></span><span className="inbox-conversation-copy"><strong>{label}</strong>{conversation.unread && <span className="inbox-unread-badge">{t('inbox.unread')}</span>}<small>{conversation.personName && conversation.accountName ? conversation.personName : conversation.channelName ?? conversation.provider}</small><small>{conversation.channelPhoneNumber ?? ''}{conversation.channelPhoneNumber ? ' · ' : ''}{conversation.ownerName ?? t('inbox.unassigned')} · {t(`inbox.modes.${conversation.automationMode}`)}</small>{conversation.tags.length > 0 && <span className="inbox-tag-list">{conversation.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</span>}<small>{t(`inbox.status.${conversation.status}`)} · {formatDate(conversation.lastMessageAt)}</small></span>
          </button>
        })}
        <div className="inbox-list-pagination"><label>{t('table.rowsPerPage')}<select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setOffset(0) }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label><span>{conversationTotal === 0 ? 0 : offset + 1}–{Math.min(offset + pageSize, conversationTotal)} / {conversationTotal}</span><div><button type="button" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>{t('table.previous')}</button><button type="button" disabled={loading || offset + pageSize >= conversationTotal} onClick={() => setOffset(offset + pageSize)}>{t('table.next')}</button></div></div>
      </aside>
      <section className="inbox-thread" aria-label={t('inbox.thread')}>
        {!selected ? <div className="inbox-empty thread-empty"><MessageSquareText size={25} /><strong>{loading ? t('common.loading') : t('inbox.selectConversation')}</strong><span>{t('inbox.readOnly')}</span></div> : <>
          <header className="inbox-thread-heading"><div><strong>{selected.accountName ?? selected.personName ?? t('inbox.unknownContact')}</strong><span>{selected.personName && selected.accountName ? selected.personName : selected.provider}</span>{selected.channelName && <small>{selected.channelName} · {selected.channelPhoneNumber}</small>}<small>{t('inbox.owner')}: {selected.ownerName ?? t('inbox.unassigned')} · {t('inbox.automation')}: {t(`inbox.modes.${selected.automationMode}`)}</small></div><div className="inbox-control-actions">
            {(!selected.ownerUserId || selected.ownerUserId === currentUserId) && assignees.length > 0 && <><label className="inbox-assignee-select"><span>{t('inbox.assignTo')}</span><select value={assigneeTarget} onChange={(event) => setAssigneeTarget(event.target.value)} disabled={controlling}><option value="" disabled>{t('inbox.selectAssignee')}</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}</select></label><button type="button" disabled={controlling || !assigneeTarget} onClick={() => void controlConversation('assign')}>{t('inbox.assign')}</button></>}
            {!selected.ownerUserId && <button type="button" disabled={controlling} onClick={() => void controlConversation('claim')}>{controlling ? t('inbox.claiming') : t('inbox.claim')}</button>}
            {selected.ownerUserId === currentUserId && selected.automationMode === 'human' && <button type="button" disabled={controlling} onClick={() => void controlConversation('pause')}>{t('inbox.pauseSofia')}</button>}
            {selected.automationMode === 'paused' && (!selected.ownerUserId || selected.ownerUserId === currentUserId) && <button type="button" disabled={controlling} onClick={() => void controlConversation('sofia')}>{t('inbox.resumeSofia')}</button>}
            {selected.ownerUserId === currentUserId && <button type="button" disabled={controlling} onClick={() => void controlConversation('release')}>{t('inbox.release')}</button>}
            <span className="tag">{t(`inbox.status.${selected.status}`)}</span></div></header>
          <div className="inbox-tag-manager"><strong>{t('inboxComposer.tagsLabel')}</strong><div className="inbox-tag-list">{selected.tags.map((tag) => <span key={tag.id}>{tag.name}{canEditTags && <button type="button" aria-label={t('inboxComposer.removeTag', { name: tag.name })} disabled={tagBusy} onClick={() => void removeTag(tag.id)}>×</button>}</span>)}</div>{canEditTags && <div><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} maxLength={32} placeholder={t('inboxComposer.tagPlaceholder')} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void addTag() } }} /><button type="button" disabled={tagBusy || tagDraft.trim().length < 2} onClick={() => void addTag()}>{tagBusy ? t('common.saving') : t('inboxComposer.addTag')}</button></div>}</div>
          <div className="inbox-messages" aria-live="polite">
            {messagesLoading ? <p className="inbox-empty">{t('common.loading')}</p> : messages.length === 0 ? <div className="inbox-empty"><span>{t('inbox.noMessagesYet')}</span><span>{t('inbox.emptyMessagesHint')}</span></div> : messages.map((message) => <article key={message.id} className={`inbox-message ${message.direction}`}>
              <div className="inbox-message-meta"><span>{message.direction === 'internal' ? t('inboxComposer.internalNoteBy', { name: message.actorName ?? t('inbox.actor.user') }) : t(`inbox.actor.${message.actorType}`)}</span><time dateTime={message.occurredAt}>{formatDate(message.occurredAt)}</time></div>
              <p>{message.bodyText || t('inbox.nonTextMessage')}</p>{message.direction !== 'internal' && <small>{t(`inbox.delivery.${message.deliveryState}`)}</small>}
            </article>)}
          </div>
          <form className="inbox-composer" onSubmit={sendMessage}>
            <div className="inbox-composer-modes"><button type="button" className={composerMode === 'reply' ? 'active' : ''} onClick={() => { setComposerMode('reply'); setMessageSendError('') }} disabled={sendingMessage}>{t('inboxComposer.replyMode')}</button><button type="button" className={composerMode === 'note' ? 'active' : ''} onClick={() => { setComposerMode('note'); setMessageSendError('') }} disabled={sendingMessage}>{t('inboxComposer.noteMode')}</button></div>
            {composerMode === 'reply' && !canSend && <p>{t('inbox.replyUnavailable')}</p>}
            {composerMode === 'note' && !canAddNote && <p>{t('inboxComposer.noteUnavailable')}</p>}
            <textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} maxLength={4096} placeholder={t(composerMode === 'note' ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} disabled={(composerMode === 'reply' ? !canSend : !canAddNote) || sendingMessage} aria-label={t(composerMode === 'note' ? 'inboxComposer.notePlaceholder' : 'inbox.replyPlaceholder')} />
            {messageSendError && <p className="inbox-send-error" role="status">{messageSendError}</p>}
            <div><small>{messageDraft.length}/4096</small><button type="submit" disabled={(composerMode === 'reply' ? !canSend : !canAddNote) || sendingMessage || !messageDraft.trim()}>{sendingMessage ? t('inbox.sending') : t(composerMode === 'note' ? 'inboxComposer.addNote' : 'inbox.send')}</button></div>
          </form>
          <footer className="inbox-readonly-note">{t('inbox.readOnly')}</footer>
        </>}
      </section>
    </div>
  </section>
}
