import { useCallback, useEffect, useState } from 'react'
import { MessageSquareText, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, type ChannelDto, type ConversationDto, type MessageDto } from '../lib/api/client'
import i18n from '../lib/i18n'
import './InboxWorkspace.css'

export function InboxWorkspace() {
  const { t } = useTranslation()
  const [conversations, setConversations] = useState<ConversationDto[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [messages, setMessages] = useState<MessageDto[]>([])
  const [channels, setChannels] = useState<ChannelDto[]>([])
  const [channelFilter, setChannelFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async (selectedChannelId = channelFilter) => {
    setLoading(true)
    setError('')
    try {
      const result = await api.inbox.conversations({ channelId: selectedChannelId || undefined, limit: 50 })
      setConversations(result)
      setSelectedId((current) => result.some((conversation) => conversation.id === current) ? current : result[0]?.id ?? '')
    } catch {
      setError(t('inbox.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [channelFilter, t])

  useEffect(() => { api.inbox.channels().then(setChannels).catch(() => setChannels([])) }, [])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!selectedId) { setMessages([]); return }
    let active = true
    setMessagesLoading(true)
    api.inbox.messages(selectedId, { limit: 100 }).then((result) => { if (active) setMessages(result) })
      .catch(() => { if (active) setError(t('inbox.messagesFailed')) })
      .finally(() => { if (active) setMessagesLoading(false) })
    return () => { active = false }
  }, [selectedId, t])

  const selected = conversations.find((conversation) => conversation.id === selectedId)
  const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : t('inbox.noMessagesYet')

  return <section className="inbox-page">
    <header className="inbox-heading"><div><p className="eyebrow">{t('inbox.eyebrow')}</p><h2>{t('inbox.title')}</h2><p className="muted">{t('inbox.description')}</p></div>
      <button className="refresh" onClick={() => void refresh(channelFilter)} aria-label={t('inbox.refresh')}><RefreshCw size={16} /></button>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="inbox-layout">
      <aside className="inbox-conversations" aria-label={t('inbox.conversationList')}>
        <label className="inbox-channel-filter">{t('channels.inboxFilter')}<select value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}><option value="">{t('channels.allInboxChannels')}</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.displayName} · {channel.phoneNumber}</option>)}</select></label>
        {loading ? <p className="inbox-empty">{t('common.loading')}</p> : conversations.length === 0 ? <div className="inbox-empty"><MessageSquareText size={22} /><strong>{t('inbox.empty')}</strong><span>{t('inbox.emptyHint')}</span></div> : conversations.map((conversation) => {
          const label = conversation.accountName ?? conversation.personName ?? t('inbox.unknownContact')
          return <button key={conversation.id} className={`inbox-conversation ${conversation.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(conversation.id)} aria-pressed={conversation.id === selectedId}>
            <span className="inbox-avatar"><MessageSquareText size={17} /></span><span className="inbox-conversation-copy"><strong>{label}</strong><small>{conversation.personName && conversation.accountName ? conversation.personName : conversation.channelName ?? conversation.provider}</small><small>{conversation.channelPhoneNumber ?? ''}{conversation.channelPhoneNumber ? ' · ' : ''}{t(`inbox.status.${conversation.status}`)} · {formatDate(conversation.lastMessageAt)}</small></span>
          </button>
        })}
      </aside>
      <section className="inbox-thread" aria-label={t('inbox.thread')}>
        {!selected ? <div className="inbox-empty thread-empty"><MessageSquareText size={25} /><strong>{loading ? t('common.loading') : t('inbox.selectConversation')}</strong><span>{t('inbox.readOnly')}</span></div> : <>
          <header className="inbox-thread-heading"><div><strong>{selected.accountName ?? selected.personName ?? t('inbox.unknownContact')}</strong><span>{selected.personName && selected.accountName ? selected.personName : selected.provider}</span>{selected.channelName && <small>{selected.channelName} · {selected.channelPhoneNumber}</small>}</div><span className="tag">{t(`inbox.status.${selected.status}`)}</span></header>
          <div className="inbox-messages" aria-live="polite">
            {messagesLoading ? <p className="inbox-empty">{t('common.loading')}</p> : messages.length === 0 ? <div className="inbox-empty"><span>{t('inbox.noMessagesYet')}</span><span>{t('inbox.emptyMessagesHint')}</span></div> : messages.map((message) => <article key={message.id} className={`inbox-message ${message.direction}`}>
              <div className="inbox-message-meta"><span>{t(`inbox.actor.${message.actorType}`)}</span><time dateTime={message.occurredAt}>{formatDate(message.occurredAt)}</time></div>
              <p>{message.bodyText || t('inbox.nonTextMessage')}</p><small>{t(`inbox.delivery.${message.deliveryState}`)}</small>
            </article>)}
          </div>
          <footer className="inbox-readonly-note">{t('inbox.readOnly')}</footer>
        </>}
      </section>
    </div>
  </section>
}
