import { Button, IconButton, SelectField, TextField } from '../components/ui/FormControls'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, Clock3, ListTodo, MessageCircle, RefreshCw, Search, ShieldAlert, UserRoundCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../components/ui/DataTable'
import { WorkspaceState } from '../components/ui/WorkspaceState'
import { api, type CloserEventDto, type CloserSlaNotificationDto, type ConversationDto, type HandoffDto, type OpportunityDto, type TaskDto } from '../lib/api'

import './CloserQueueWorkspace.css'
import './CloserEventActions.css'
import './CloserSlaNotifications.css'

const CLOSER_QUEUE_WORK_KINDS = ['handoff', 'awaiting_first_activity', 'lead_reply', 'overdue', 'no_action', 'task', 'unread_conversation'] as const
type WorkKind = typeof CLOSER_QUEUE_WORK_KINDS[number]
const CLOSER_QUEUE_EVENT_FILTER = 'conversation_events' as const
const CLOSER_QUEUE_TASK_FILTER = 'open_tasks' as const
const CLOSER_QUEUE_UNREAD_FILTER = 'unread_conversations' as const
const ACTIVE_CONVERSATION_STATUSES = ['open', 'pending', 'snoozed'] as const
type WorkFilter = WorkKind | typeof CLOSER_QUEUE_EVENT_FILTER | typeof CLOSER_QUEUE_TASK_FILTER | typeof CLOSER_QUEUE_UNREAD_FILTER | ''
function isWorkKind(value: string): value is WorkKind { return CLOSER_QUEUE_WORK_KINDS.some((kind) => kind === value) }
type SortKey = 'priority' | 'account' | 'event' | 'deadline'
type WorkItem = { id: string; kind: WorkKind; accountName: string; contactName: string; title: string; context: string; occurredAt: string; deadline: string | null; handoff?: HandoffDto; event?: CloserEventDto; task?: TaskDto; conversation?: ConversationDto }
type CloserEventActionInput = { action: 'snooze' | 'resolve' | 'reassign'; snoozedUntil?: string; assignedToUserId?: string }
type OpportunityPage = Awaited<ReturnType<typeof api.opportunities.list>>

function CloserEventActions({ event, assignees, acceptingId, eventAssignId, eventAssignTarget, onAction, onAssignmentChange }: { event: CloserEventDto; assignees: Array<{ id: string; name: string }>; acceptingId: string; eventAssignId: string; eventAssignTarget: string; onAction: (event: CloserEventDto, input: CloserEventActionInput) => Promise<void>; onAssignmentChange: (eventId: string, targetUserId: string) => void }) {
  const { t } = useTranslation()
  return <div className="closer-event-actions">
    <IconButton label={t('closerEventActions.snoozeOneHour')} disabled={acceptingId === event.id} onClick={() => void onAction(event, { action: 'snooze', snoozedUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString() })}><Clock3 size={15} /></IconButton>
    <IconButton label={t('closerEventActions.resolveEvent')} disabled={acceptingId === event.id} onClick={() => void onAction(event, { action: 'resolve' })}><Check size={15} /></IconButton>
    <SelectField aria-label={t('closerEventActions.reassignEvent')} value={eventAssignId === event.id ? eventAssignTarget : ''} disabled={acceptingId === event.id} onChange={(change) => onAssignmentChange(event.id, change.target.value)}>
      <option value="">{t('closerEventActions.reassignEvent')}</option>
      {assignees.filter((assignee) => assignee.id !== event.assignedToUserId).map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
    </SelectField>
    {eventAssignId === event.id && eventAssignTarget && <IconButton label={t('closerEventActions.confirmReassign')} disabled={acceptingId === event.id} onClick={() => void onAction(event, { action: 'reassign', assignedToUserId: eventAssignTarget })}><UserRoundCheck size={15} /></IconButton>}
  </div>
}

async function listAllOwnedOpportunities(businessLineId?: string): Promise<OpportunityDto[]> {
  const pageSize = 100; const maxPages = 20
  const firstPage = await api.opportunities.list({ businessLineId, view: 'mine', limit: pageSize, offset: 0 })
  const pages: OpportunityPage[] = [firstPage]
  for (let offset = pageSize; pages.length < maxPages && pages[pages.length - 1].length === pageSize; offset += pageSize) {
    pages.push(await api.opportunities.list({ businessLineId, view: 'mine', limit: pageSize, offset }))
  }
  return pages.flat()
}

async function listAllHandoffs(status: HandoffDto['status'], businessLineId?: string): Promise<HandoffDto[]> {
  const pageSize = 100; const maxPages = 20
  const records: HandoffDto[] = []
  for (let offset = 0, page = 0; page < maxPages; offset += pageSize, page++) {
    const result = await api.handoffs.list(status, { businessLineId, limit: pageSize, offset })
    records.push(...result)
    if (result.length < pageSize) return records
  }
  return records
}

async function listAllCloserEvents(businessLineId?: string): Promise<CloserEventDto[]> {
  const pageSize = 100
  const events: CloserEventDto[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await api.closerEvents.list({ businessLineId, limit: pageSize, offset })
    events.push(...page.data)
    if (!page.pagination.hasNextPage) return events
  }
}

async function listAllOpenTasks(businessLineId?: string): Promise<TaskDto[]> {
  const pageSize = 100
  const tasks: TaskDto[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await api.tasks.listPage({ businessLineId, status: 'open', sortBy: 'dueAt', sortDirection: 'asc', limit: pageSize, offset })
    tasks.push(...page.data)
    if (!page.pagination.hasNextPage) return tasks
  }
}

async function listAllUnreadActiveConversations(businessLineId?: string): Promise<ConversationDto[]> {
  const pageSize = 100
  const conversations: ConversationDto[] = []
  for (let offset = 0; ; offset += pageSize) {
    const page = await api.inbox.conversations({ businessLineId, unreadOnly: true, limit: pageSize, offset })
    conversations.push(...page.data)
    if (!page.pagination.hasNextPage) return conversations.filter((conversation) => ACTIVE_CONVERSATION_STATUSES.some((status) => status === conversation.status))
  }
}

export function CloserQueueWorkspace({ userId, onOpenPipeline, onOpenInbox, onOpenTask }: { userId: string; onOpenPipeline: () => void; onOpenInbox: (conversationId: string) => void; onOpenTask: (taskId: string) => void }) {
  const { t, i18n } = useTranslation()
  const dateLabel = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  const elapsedSince = (value: string) => { const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000)); if (minutes < 60) return t('closerQueue.elapsed.minutes', { count: minutes }); const hours = Math.floor(minutes / 60); if (hours < 24) return t('closerQueue.elapsed.hours', { count: hours }); return t('closerQueue.elapsed.days', { days: Math.floor(hours / 24), hours: hours % 24 }) }
  const [searchParams] = useSearchParams()
  const businessLineId = searchParams.get('businessLineId') ?? undefined
  const [handoffs, setHandoffs] = useState<HandoffDto[]>([])
  const [acceptedHandoffs, setAcceptedHandoffs] = useState<HandoffDto[]>([])
  const [opportunities, setOpportunities] = useState<OpportunityDto[]>([])
  const [closerEvents, setCloserEvents] = useState<CloserEventDto[]>([])
  const [openTasks, setOpenTasks] = useState<TaskDto[]>([])
  const [unreadConversations, setUnreadConversations] = useState<ConversationDto[]>([])
  const [slaNotifications, setSlaNotifications] = useState<CloserSlaNotificationDto[]>([])
  const [eventAssignees, setEventAssignees] = useState<Array<{ id: string; name: string }>>([])
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<WorkFilter>('')
  const [sortKey, setSortKey] = useState<SortKey>('priority')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [limit, setLimit] = useState(25)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [queueLoadFailed, setQueueLoadFailed] = useState(false)
  const [summaryLoadFailed, setSummaryLoadFailed] = useState(false)
  const [error, setError] = useState('')
  const [partial, setPartial] = useState(false)
  const [acceptingId, setAcceptingId] = useState('')
  const [eventAssignTarget, setEventAssignTarget] = useState('')
  const [eventAssignId, setEventAssignId] = useState('')
  const [refresh, setRefresh] = useState(0)
  const queueLoadInProgressRef = useRef(false)
  const pendingRefreshRef = useRef(false)
  const hasLoadedQueueRef = useRef(false)
  const mountedRef = useRef(true)
  const requestRefresh = useCallback(() => {
    if (queueLoadInProgressRef.current) {
      pendingRefreshRef.current = true
      return
    }
    setRefresh((version) => version + 1)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') requestRefresh()
    }
    const interval = window.setInterval(refreshIfVisible, 30_000)
    document.addEventListener('visibilitychange', refreshIfVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshIfVisible)
    }
  }, [requestRefresh])

  useEffect(() => {
    let active = true
    if (queueLoadInProgressRef.current) {
      pendingRefreshRef.current = true
      return () => { active = false }
    }
    queueLoadInProgressRef.current = true
    if (!hasLoadedQueueRef.current) setLoading(true)
    else setRefreshing(true)
    setError(''); setPartial(false); setQueueLoadFailed(false)
    Promise.allSettled([listAllHandoffs('requested', businessLineId), listAllHandoffs('accepted', businessLineId), listAllOwnedOpportunities(businessLineId), listAllCloserEvents(businessLineId), listAllOpenTasks(businessLineId), listAllUnreadActiveConversations(businessLineId), api.closerEvents.assignees(), api.closerEvents.slaNotifications()]).then(([handoffResult, acceptedResult, opportunityResult, eventResult, taskResult, conversationResult, assigneeResult, notificationResult]) => {
      if (!active) return
      if (handoffResult.status === 'fulfilled') setHandoffs(handoffResult.value)
      if (acceptedResult.status === 'fulfilled') setAcceptedHandoffs(acceptedResult.value)
      if (opportunityResult.status === 'fulfilled') setOpportunities(opportunityResult.value)
      if (eventResult.status === 'fulfilled') setCloserEvents(eventResult.value)
      if (taskResult.status === 'fulfilled') setOpenTasks(taskResult.value)
      if (conversationResult.status === 'fulfilled') setUnreadConversations(conversationResult.value)
      if (assigneeResult.status === 'fulfilled') setEventAssignees(assigneeResult.value)
      if (notificationResult.status === 'fulfilled') setSlaNotifications(notificationResult.value)
      const failed = [handoffResult, acceptedResult, opportunityResult, eventResult, taskResult, conversationResult, assigneeResult, notificationResult].filter((result) => result.status === 'rejected').length
      const coreResults = [handoffResult, acceptedResult, opportunityResult, eventResult, taskResult, conversationResult]
      const coreFailed = coreResults.some((result) => result.status === 'rejected')
      setSummaryLoadFailed(coreFailed)
      setPartial(failed > 0 && failed < 8); setQueueLoadFailed(failed === 8); setError(failed === 8 ? t('closerQueue.loadFailed') : '')
    }).finally(() => {
      queueLoadInProgressRef.current = false
      if (active) {
        hasLoadedQueueRef.current = true
        setLoading(false)
        setRefreshing(false)
      }
      if (pendingRefreshRef.current && mountedRef.current) {
        pendingRefreshRef.current = false
        requestRefresh()
      }
    })
    return () => { active = false }
  }, [businessLineId, refresh, t, requestRefresh])

  const acceptHandoff = async (handoff: HandoffDto) => {
    setAcceptingId(handoff.id); setError('')
    try {
      const accepted = await api.handoffs.accept(handoff.id)
      requestRefresh()
      if (accepted.conversationId) onOpenInbox(accepted.conversationId)
    }
    catch { setError(t('closerQueue.acceptFailed')) }
    finally { setAcceptingId('') }
  }
  const openEvent = async (event: CloserEventDto) => {
    setAcceptingId(event.id); setError('')
    try {
      if (event.status !== 'acknowledged') await api.closerEvents.act(event.id, { action: 'acknowledge' })
      onOpenInbox(event.conversationId)
    } catch { setError(t('closerQueue.eventActionFailed')) }
    finally { setAcceptingId('') }
  }
  const actOnEvent = async (event: CloserEventDto, input: CloserEventActionInput) => {
    setAcceptingId(event.id); setError('')
    try {
      await api.closerEvents.act(event.id, input)
      setEventAssignTarget(''); setEventAssignId(''); requestRefresh()
    } catch { setError(t('closerQueue.eventActionFailed')) }
    finally { setAcceptingId('') }
  }
  const openSlaNotification = async (notification: CloserSlaNotificationDto) => {
    setAcceptingId(notification.id); setError('')
    try {
      await api.closerEvents.readSlaNotification(notification.id)
      setSlaNotifications((current) => current.filter((item) => item.id !== notification.id))
      onOpenInbox(notification.conversationId)
    } catch { setError(t('closerQueue.eventActionFailed')) }
    finally { setAcceptingId('') }
  }

  const items = useMemo(() => {
    const handoffByOpportunity = new Map(handoffs.map((handoff) => [handoff.opportunityId, handoff]))
    const ownedOpportunityIds = new Set(opportunities.filter((opportunity) => opportunity.ownerUserId === userId && !['won', 'lost'].includes(opportunity.stage)).map((opportunity) => opportunity.id))
    const waitingForFirstActivity = acceptedHandoffs.filter((handoff) => ownedOpportunityIds.has(handoff.opportunityId) && !handoff.firstActivityAt && handoff.acceptedAt)
    const waitingOpportunityIds = new Set(waitingForFirstActivity.map((handoff) => handoff.opportunityId))
    const linkedHandoffIds = new Set(closerEvents.flatMap((event) => {
      const handoff = ['qualified_handoff', 'human_requested'].includes(event.eventType) ? handoffByOpportunity.get(event.opportunityId) : undefined
      return handoff ? [handoff.id] : []
    }))
    const work: WorkItem[] = handoffs.filter((handoff) => !linkedHandoffIds.has(handoff.id)).map((handoff) => ({ id: `handoff:${handoff.id}`, kind: 'handoff', accountName: handoff.accountName, contactName: handoff.contactName ?? t('pipelineWorklist.unknownContact'), title: handoff.reason, context: handoff.evidence, occurredAt: handoff.requestedAt, deadline: handoff.nextStepAt, handoff }))
    work.push(...closerEvents.map((event) => {
      const handoff = ['qualified_handoff', 'human_requested'].includes(event.eventType) ? handoffByOpportunity.get(event.opportunityId) : undefined
      return { id: handoff ? `handoff:${handoff.id}` : `event:${event.id}`, kind: handoff ? 'handoff' as const : 'lead_reply' as const, accountName: event.accountName ?? event.summary, contactName: event.contactName ?? '', title: handoff?.reason ?? t(`closerEventTypes.${event.eventType}`), context: handoff?.evidence ?? event.evidence ?? '', occurredAt: handoff?.requestedAt ?? event.occurredAt, deadline: event.dueAt ?? handoff?.nextStepAt ?? null, handoff, event }
    }))
    work.push(...waitingForFirstActivity.flatMap((handoff) => {
      if (!handoff.acceptedAt) return []
      const acceptedAt = handoff.acceptedAt
      return [{ id: `accepted-handoff:${handoff.id}`, kind: 'awaiting_first_activity' as const, accountName: handoff.accountName, contactName: handoff.contactName ?? t('pipelineWorklist.unknownContact'), title: t('closerQueue.awaitingFirstActivity'), context: `${handoff.evidence} · ${t('closerQueue.waitingElapsed', { duration: elapsedSince(acceptedAt) })}`, occurredAt: acceptedAt, deadline: null, handoff }]
    }))
    const terminalStages = new Set(['won', 'lost'])
    for (const opportunity of opportunities) {
      if (terminalStages.has(opportunity.stage) || opportunity.ownerUserId !== userId || waitingOpportunityIds.has(opportunity.id)) continue
      const due = opportunity.nextActionAt ? new Date(opportunity.nextActionAt).getTime() : null
      if (due !== null && due > Date.now()) continue
      const kind: WorkKind = due === null ? 'no_action' : 'overdue'
      work.push({ id: `opportunity:${opportunity.id}`, kind, accountName: opportunity.accountName, contactName: opportunity.contactName ?? t('pipelineWorklist.unknownContact'), title: opportunity.nextAction ?? (opportunity.stage === 'custom' ? opportunity.pipelineStageName ?? t('pipelineStageSettings.custom') : t(`opportunityStages.${opportunity.stage}`)), context: `${opportunity.name} · ${kind === 'overdue' && opportunity.nextActionAt ? t('closerQueue.overdueContext', { date: dateLabel(opportunity.nextActionAt) }) : t('closerQueue.noActionContext')}`, occurredAt: opportunity.updatedAt, deadline: opportunity.nextActionAt ?? null })
    }
    work.push(...openTasks.map((task) => {
      const isOverdue = new Date(task.dueAt).getTime() < Date.now()
      return { id: `task:${task.id}`, kind: isOverdue ? 'overdue' as const : 'task' as const, accountName: task.accountName, contactName: task.contactName ?? '', title: task.title, context: isOverdue ? t('closerQueue.taskOverdueContext') : t('closerQueue.taskDueContext'), occurredAt: task.dueAt, deadline: task.dueAt, task }
    }))
    work.push(...unreadConversations.map((conversation) => ({ id: `conversation:${conversation.id}`, kind: 'unread_conversation' as const, accountName: conversation.accountName ?? conversation.channelName ?? conversation.provider, contactName: conversation.personName ?? '', title: t('closerQueue.unreadConversationTitle'), context: t('closerQueue.unreadConversationContext', { status: t(`inbox.status.${conversation.status}`) }), occurredAt: conversation.lastMessageAt ?? conversation.createdAt, deadline: null, conversation })))
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const filtered = work.filter((item) => (!kindFilter || (kindFilter === CLOSER_QUEUE_EVENT_FILTER ? Boolean(item.event) : kindFilter === CLOSER_QUEUE_TASK_FILTER ? Boolean(item.task) : kindFilter === CLOSER_QUEUE_UNREAD_FILTER ? Boolean(item.conversation) : item.kind === kindFilter)) && (!normalizedQuery || `${item.accountName} ${item.contactName} ${item.title} ${item.context}`.toLocaleLowerCase().includes(normalizedQuery)))
    const priority: Record<WorkKind, number> = { handoff: 0, awaiting_first_activity: 0, lead_reply: 0, unread_conversation: 0, overdue: 1, task: 2, no_action: 3 }
    const direction = sortDirection === 'asc' ? 1 : -1
    return filtered.sort((left, right) => {
      let comparison = 0
      if (sortKey === 'priority') comparison = (left.event?.priority === 'urgent' ? -1 : priority[left.kind]) - (right.event?.priority === 'urgent' ? -1 : priority[right.kind])
      if (sortKey === 'account') comparison = left.accountName.localeCompare(right.accountName)
      if (sortKey === 'event') comparison = left.title.localeCompare(right.title)
      if (sortKey === 'deadline') comparison = (left.deadline ? new Date(left.deadline).getTime() : Number.POSITIVE_INFINITY) - (right.deadline ? new Date(right.deadline).getTime() : Number.POSITIVE_INFINITY)
      return comparison * direction || (sortKey === 'priority' ? new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime() : 0) || left.id.localeCompare(right.id)
    })
  }, [handoffs, acceptedHandoffs, opportunities, closerEvents, openTasks, unreadConversations, query, kindFilter, sortKey, sortDirection, userId, t])

  const columns: DataTableColumn<WorkItem, SortKey>[] = [
    { id: 'priority', label: t('closerQueue.columns.priority'), render: (item) => <span className={`closer-priority closer-priority-${item.event?.priority ?? item.kind}`}>{item.event?.priority === 'urgent' ? <ShieldAlert size={14} /> : item.task ? <ListTodo size={14} /> : item.conversation ? <MessageCircle size={14} /> : item.kind === 'handoff' || item.kind === 'lead_reply' ? <UserRoundCheck size={14} /> : <Clock3 size={14} />}{item.event ? t(`closerEventKinds.${item.event.eventType}`) : t(`closerQueue.kinds.${item.kind}`)}</span> },
    { id: 'account', label: t('closerQueue.columns.accountContact'), render: (item) => <div className="closer-account-cell"><strong>{item.accountName}</strong><small>{item.contactName}</small></div> },
    { id: 'event', label: t('closerQueue.columns.context'), render: (item) => {
      const event = item.event
      return <div className="closer-event-cell">
        <strong>{item.title}</strong><p>{item.context}</p>
        {item.conversation && <small>{dateLabel(item.conversation.lastMessageAt ?? item.conversation.createdAt)}</small>}
        {event?.eventType === 'interpretation_failure' && <small className="closer-interpretation-reason">{t('closerEventActions.interpretationFailureReason', { reason: event.summary })}</small>}
        {event?.status === 'acknowledged' && <small>{t('closerQueue.acknowledged')}</small>}
        {item.handoff && item.handoff.confirmedFacts.length > 0 && <small>{t('closerQueue.confirmedFacts', { facts: item.handoff.confirmedFacts.join(' · ') })}</small>}
        {item.handoff && item.handoff.unknowns.length > 0 && <small className="closer-unknowns">{t('closerQueue.openQuestions', { questions: item.handoff.unknowns.join(' · ') })}</small>}
        {event && <CloserEventActions event={event} assignees={eventAssignees} acceptingId={acceptingId} eventAssignId={eventAssignId} eventAssignTarget={eventAssignTarget} onAction={actOnEvent} onAssignmentChange={(eventId, targetUserId) => { setEventAssignId(eventId); setEventAssignTarget(targetUserId) }} />}
        <IconButton className="closer-item-action" disabled={Boolean(acceptingId)} label={item.task ? t('closerQueue.openTask') : item.conversation ? t('closerQueue.openConversation') : item.handoff ? (item.handoff.status === 'requested' ? acceptingId === item.handoff.id ? t('closerQueue.accepting') : t('closerQueue.acceptAction') : item.handoff.conversationId ? t('closerQueue.openConversation') : t('closerQueue.openPipeline')) : event ? (acceptingId === event.id ? t('common.loading') : t('closerQueue.openConversation')) : t('closerQueue.openPipeline')} onClick={() => item.task ? onOpenTask(item.task.id) : item.conversation ? onOpenInbox(item.conversation.id) : item.handoff ? item.handoff.status === 'requested' ? void acceptHandoff(item.handoff) : item.handoff.conversationId ? onOpenInbox(item.handoff.conversationId) : onOpenPipeline() : event ? void openEvent(event) : onOpenPipeline()}><ArrowRight size={15} /></IconButton>
      </div>
    } },
    { id: 'deadline', label: t('closerQueue.columns.deadline'), render: (item) => <span className="closer-deadline">{item.deadline ? <>{dateLabel(item.deadline)}{item.kind === 'overdue' && <small>{t(item.task ? 'tasks.overdue' : 'closerSlaSettings.overdue')}</small>}</> : '—'}</span> },
  ]
  const summaryValue = (value: number) => !hasLoadedQueueRef.current || queueLoadFailed || summaryLoadFailed ? '—' : value
  const handoffCount = items.filter((item) => item.kind === 'handoff').length
  const waitingFirstActivityCount = items.filter((item) => item.kind === 'awaiting_first_activity').length
  const replyCount = items.filter((item) => Boolean(item.event)).length
  const overdueCount = items.filter((item) => item.kind === 'overdue').length
  const noActionCount = items.filter((item) => item.kind === 'no_action').length
  const openTaskCount = items.filter((item) => Boolean(item.task)).length
  const unreadConversationCount = items.filter((item) => Boolean(item.conversation)).length
  const pageRows = items.slice(offset, offset + limit)
  const emptyState = <div><strong>{error || t('closerQueue.empty')}</strong></div>

  return <section className="closer-queue-page">
    <header className="closer-queue-heading"><div><p className="eyebrow">{t('closerQueue.eyebrow')}</p><h2>{t('closerQueue.title')}</h2><p className="muted">{t('closerQueue.description')}</p></div><Button className={`refresh${refreshing ? ' is-refreshing' : ''}`} aria-busy={refreshing ? 'true' : undefined} type="button" onClick={requestRefresh} aria-label={t('closerQueue.refresh')}><RefreshCw size={16} /></Button></header>
    {slaNotifications.length > 0 && <section className="closer-sla-notifications" aria-label={t('closerSlaSettings.notifications.title')}><h3>{t('closerSlaSettings.notifications.title')}</h3>{slaNotifications.map((notification) => <article key={notification.id}><div><strong>{t(`closerSlaSettings.notifications.${notification.notificationType === 'closer_event_sla_escalated' ? 'escalated' : 'overdue'}`)}</strong><span>{notification.accountName ?? notification.summary}</span><small>{t(`closerEventTypes.${notification.eventType}`)} · {dateLabel(notification.dueAt)}</small></div><Button type="button" disabled={Boolean(acceptingId)} onClick={() => void openSlaNotification(notification)}>{t('closerQueue.openConversation')}<ArrowRight size={13} /></Button></article>)}</section>}
    <div className="closer-queue-summary" role="group" aria-label={t('closerQueue.summary.label')}>
      <Button type="button" className={`summary-handoffs${kindFilter === 'handoff' ? ' is-active' : ''}`} aria-pressed={kindFilter === 'handoff'} onClick={() => { setKindFilter((current) => current === 'handoff' ? '' : 'handoff'); setOffset(0) }}><span><UserRoundCheck size={15} />{t('closerQueue.summary.handoffs')}</span><strong>{summaryValue(handoffCount)}</strong></Button>
      <Button type="button" className={`summary-replies${kindFilter === CLOSER_QUEUE_EVENT_FILTER ? ' is-active' : ''}`} aria-pressed={kindFilter === CLOSER_QUEUE_EVENT_FILTER} onClick={() => { setKindFilter((current) => current === CLOSER_QUEUE_EVENT_FILTER ? '' : CLOSER_QUEUE_EVENT_FILTER); setOffset(0) }}><span><MessageCircle size={15} />{t('closerEventActions.eventsSummary')}</span><strong>{summaryValue(replyCount)}</strong></Button>
      <Button type="button" className={kindFilter === CLOSER_QUEUE_TASK_FILTER ? 'summary-tasks is-active' : 'summary-tasks'} aria-pressed={kindFilter === CLOSER_QUEUE_TASK_FILTER} onClick={() => { setKindFilter((current) => current === CLOSER_QUEUE_TASK_FILTER ? '' : CLOSER_QUEUE_TASK_FILTER); setOffset(0) }}><span><ListTodo size={15} />{t('closerQueue.summary.openTasks')}</span><strong>{summaryValue(openTaskCount)}</strong></Button>
      <Button type="button" className={kindFilter === CLOSER_QUEUE_UNREAD_FILTER ? 'summary-unread is-active' : 'summary-unread'} aria-pressed={kindFilter === CLOSER_QUEUE_UNREAD_FILTER} onClick={() => { setKindFilter((current) => current === CLOSER_QUEUE_UNREAD_FILTER ? '' : CLOSER_QUEUE_UNREAD_FILTER); setOffset(0) }}><span><MessageCircle size={15} />{t('closerQueue.summary.unreadConversations')}</span><strong>{summaryValue(unreadConversationCount)}</strong></Button>
      <Button type="button" className={`summary-overdue${kindFilter === 'overdue' ? ' is-active' : ''}`} aria-pressed={kindFilter === 'overdue'} onClick={() => { setKindFilter((current) => current === 'overdue' ? '' : 'overdue'); setOffset(0) }}><span><Clock3 size={15} />{t('closerQueue.summary.overdue')}</span><strong>{summaryValue(overdueCount)}</strong></Button>
      <Button type="button" className={`summary-waiting${kindFilter === 'awaiting_first_activity' ? ' is-active' : ''}`} aria-pressed={kindFilter === 'awaiting_first_activity'} onClick={() => { setKindFilter((current) => current === 'awaiting_first_activity' ? '' : 'awaiting_first_activity'); setOffset(0) }}><span><Clock3 size={15} />{t('closerQueue.summary.waitingFirstActivity')}</span><strong>{summaryValue(waitingFirstActivityCount)}</strong></Button>
      <Button type="button" className={kindFilter === 'no_action' ? 'is-active' : ''} aria-pressed={kindFilter === 'no_action'} onClick={() => { setKindFilter((current) => current === 'no_action' ? '' : 'no_action'); setOffset(0) }}><span><ShieldAlert size={15} />{t('closerQueue.summary.noAction')}</span><strong>{summaryValue(noActionCount)}</strong></Button>
    </div>
    {error && items.length > 0 && <WorkspaceState kind="error" compact message={error} detail={t('table.resultsRetained')} />}
    {partial && <WorkspaceState kind="partial" compact message={t('closerQueue.partial')} />}
    {refreshing && <WorkspaceState kind="stale" compact message={t('table.refreshingResults')} detail={t('table.showingPreviousResults')} />}
    <DataTable rows={pageRows} columns={columns} getRowId={(item) => item.id} sort={{ key: sortKey, direction: sortDirection }} onSortChange={(key, direction) => { setSortKey(key); setSortDirection(direction); setOffset(0) }} pagination={{ limit, offset, total: items.length, hasNextPage: offset + limit < items.length }} onPageChange={setOffset} onPageSizeChange={(size) => { setLimit(size); setOffset(0) }} loading={loading} emptyState={emptyState} emptyStateKind={error ? 'error' : 'empty'} filters={<>
      <label className="closer-queue-search"><Search size={15} /><TextField value={query} onChange={(event) => { setQuery(event.target.value); setOffset(0) }} placeholder={t('closerQueue.search')} aria-label={t('closerQueue.search')} /></label>
      <label className="closer-queue-filter">{t('closerQueue.filterLabel')}<SelectField value={kindFilter} onChange={(event) => { const value = event.target.value; if (value === '' || value === CLOSER_QUEUE_EVENT_FILTER || value === CLOSER_QUEUE_TASK_FILTER || value === CLOSER_QUEUE_UNREAD_FILTER || isWorkKind(value)) setKindFilter(value); setOffset(0) }}><option value="">{t('closerQueue.allTypes')}</option><option value={CLOSER_QUEUE_EVENT_FILTER}>{t('closerEventActions.eventsFilter')}</option><option value={CLOSER_QUEUE_TASK_FILTER}>{t('closerQueue.summary.openTasks')}</option><option value={CLOSER_QUEUE_UNREAD_FILTER}>{t('closerQueue.summary.unreadConversations')}</option>{CLOSER_QUEUE_WORK_KINDS.filter((kind) => kind !== 'lead_reply' && kind !== 'task' && kind !== 'unread_conversation').map((kind) => <option key={kind} value={kind}>{t(`closerQueue.kinds.${kind}`)}</option>)}</SelectField></label>
    </>} />
  </section>
}

