export const USER_NOTIFICATION_TYPE = {
  closerEventSlaOverdue: 'closer_event_sla_overdue',
  closerEventSlaEscalated: 'closer_event_sla_escalated',
  inboxNewMessage: 'inbox_new_message',
  messageDeliveryFailed: 'message_delivery_failed',
  taskOverdue: 'task_overdue',
  handoffAccepted: 'handoff_accepted',
  handoffReturned: 'handoff_returned',
  conversationAssigned: 'conversation_assigned',
  opportunityAssigned: 'opportunity_assigned',
  channelDisconnected: 'channel_disconnected',
} as const

export const USER_NOTIFICATION_TYPES = Object.values(USER_NOTIFICATION_TYPE)
