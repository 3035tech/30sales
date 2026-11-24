export const EVOLUTION_WEBHOOK_EVENT = {
  applicationStartup: 'application.startup',
  qrCodeUpdated: 'qrcode.updated',
  connectionUpdate: 'connection.update',
  logoutInstance: 'logout.instance',
  removeInstance: 'remove.instance',
  messagesSet: 'messages.set',
  messagesUpsert: 'messages.upsert',
  messagesUpdate: 'messages.update',
  messagesDelete: 'messages.delete',
  sendMessage: 'send.message',
  contactsSet: 'contacts.set',
  contactsUpsert: 'contacts.upsert',
  contactsUpdate: 'contacts.update',
  presenceUpdate: 'presence.update',
  chatsSet: 'chats.set',
  chatsUpdate: 'chats.update',
  chatsUpsert: 'chats.upsert',
  chatsDelete: 'chats.delete',
  groupsUpsert: 'groups.upsert',
  groupsUpdate: 'groups.update',
  groupUpdate: 'group.update',
  groupParticipantsUpdate: 'group.participants.update',
  newToken: 'new.token',
  messagesEdited: 'messages.edited',
  sendMessageUpdate: 'send.message.update',
  labelsEdit: 'labels.edit',
  labelsAssociation: 'labels.association',
  call: 'call',
  typebotStart: 'typebot.start',
  typebotChangeStatus: 'typebot.change.status',
} as const;

export const EVOLUTION_WEBHOOK_EVENT_VALUES = Object.values(EVOLUTION_WEBHOOK_EVENT);

export const EVOLUTION_CONNECTION_STATE = {
  open: 'open',
  connected: 'connected',
  connecting: 'connecting',
  reconnecting: 'reconnecting',
  close: 'close',
  closed: 'closed',
  disconnected: 'disconnected',
  disconnecting: 'disconnecting',
} as const;

export const META_WHATSAPP_WEBHOOK_FIELD = {
  messages: 'messages',
  accountUpdate: 'account_update',
  messageTemplateStatusUpdate: 'message_template_status_update',
  messageTemplateQualityUpdate: 'message_template_quality_update',
  phoneNumberNameUpdate: 'phone_number_name_update',
  phoneNumberQualityUpdate: 'phone_number_quality_update',
  businessCapabilityUpdate: 'business_capability_update',
  accountAlerts: 'account_alerts',
  accountReviewUpdate: 'account_review_update',
  messageTemplateComponentsUpdate: 'message_template_components_update',
  templateCategoryUpdate: 'template_category_update',
  userPreferences: 'user_preferences',
  smbMessageEchoes: 'smb_message_echoes',
  history: 'history',
  automaticEvents: 'automatic_events',
  calls: 'calls',
  partnerSolutions: 'partner_solutions',
  paymentConfigurationUpdate: 'payment_configuration_update',
  security: 'security',
  smbAppStateSync: 'smb_app_state_sync',
} as const;

export const META_WHATSAPP_WEBHOOK_FIELD_VALUES = Object.values(META_WHATSAPP_WEBHOOK_FIELD);
export const META_EXTERNAL_RECORD_TYPE = { businessScopedUserId: 'meta_bsuid' } as const;

export const PROVIDER_EVENT_FAMILY = {
  channel: 'channel',
  message: 'message',
  contact: 'contact',
  presence: 'presence',
  chat: 'chat',
  group: 'group',
  account: 'account',
  template: 'template',
  security: 'security',
  call: 'call',
  sync: 'sync',
  other: 'other',
} as const;

export const PROVIDER_MESSAGE_DELIVERY_STATE = { accepted: 'accepted', delivered: 'delivered', read: 'read', failed: 'failed' } as const;
export const PROVIDER_MESSAGE_DELIVERY_STATES = Object.values(PROVIDER_MESSAGE_DELIVERY_STATE);
export const PROVIDER_MESSAGE_STATUS_EVENT = { matched: 'messages.status', unmatched: 'messages.status.unmatched' } as const;
export const WEBHOOK_EVENT_PROCESSING_STATE = { pending: 'pending', processed: 'processed', failed: 'failed' } as const;
export const EVOLUTION_STATUS_RECONCILIATION = {
  initialAttempts: 1,
  attemptIncrement: 1,
  pollIntervalMs: 30_000,
  batchSize: 50,
  initialRetryDelayMs: 60_000,
  maximumAttempts: 10,
  minimumResultCount: 0,
  unmatchedErrorCode: 'EVOLUTION_MESSAGE_STATUS_UNMATCHED',
  invalidPayloadErrorCode: 'EVOLUTION_MESSAGE_STATUS_PAYLOAD_INVALID',
} as const;
