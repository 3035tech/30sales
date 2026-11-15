import { sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { organization as authOrganization, user as authUser } from './auth-schema';

export const leadStatus = pgEnum('lead_status', ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']);
export const leadSource = pgEnum('lead_source', ['manual', 'import', 'whatsapp', 'referral']);
export const taskStatus = pgEnum('task_status', ['open', 'completed', 'cancelled']);
export const opportunityStage = pgEnum('opportunity_stage', ['qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost']);
export const handoffStatus = pgEnum('handoff_status', ['requested', 'accepted', 'returned', 'cancelled']);
export const handoffEventType = pgEnum('handoff_event_type', ['requested', 'accepted', 'returned']);
export const activityType = pgEnum('activity_type', ['call', 'meeting', 'email', 'message', 'task', 'note', 'research']);
export const conversationStatus = pgEnum('conversation_status', ['open', 'pending', 'resolved', 'snoozed']);
export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound', 'internal']);
export const messageActorType = pgEnum('message_actor_type', ['contact', 'user', 'assistant', 'system']);
export const messageDeliveryState = pgEnum('message_delivery_state', ['received', 'requested', 'accepted', 'delivered', 'read', 'failed', 'unknown']);
export const eventProcessingState = pgEnum('event_processing_state', ['pending', 'processing', 'processed', 'failed']);
export const outboxState = pgEnum('outbox_state', ['pending', 'published', 'failed']);
export const jobState = pgEnum('job_state', ['queued', 'running', 'completed', 'failed']);
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const accounts = pgTable('accounts', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique('accounts_id_organization_unique').on(table.id, table.organizationId), index('accounts_org_name_idx').on(table.organizationId, table.name)]);

export const people = pgTable('people', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique('people_id_organization_unique').on(table.id, table.organizationId), index('people_org_email_idx').on(table.organizationId, table.email), index('people_org_phone_idx').on(table.organizationId, table.phone)]);

export const leads = pgTable('leads', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull(),
  personId: uuid('person_id').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  assignedToUserId: uuid('assigned_to_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  source: leadSource('source').default('manual').notNull(),
  status: leadStatus('status').default('new').notNull(),
  nextActionAt: timestamp('next_action_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'leads_account_tenant_fk', columns: [table.accountId, table.organizationId], foreignColumns: [accounts.id, accounts.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'leads_person_tenant_fk', columns: [table.personId, table.organizationId], foreignColumns: [people.id, people.organizationId] }).onDelete('cascade'),
  unique('leads_id_organization_unique').on(table.id, table.organizationId),
  index('leads_org_status_next_action_idx').on(table.organizationId, table.status, table.nextActionAt),
  index('leads_org_created_idx').on(table.organizationId, table.createdAt),
  index('leads_org_assignee_status_idx').on(table.organizationId, table.assignedToUserId, table.status),
]);

export const leadStatusHistory = pgTable('lead_status_history', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  leadId: uuid('lead_id').notNull(),
  fromStatus: leadStatus('from_status'),
  toStatus: leadStatus('to_status').notNull(),
  changedByUserId: uuid('changed_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  changedAt: timestamp('changed_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'lead_status_history_lead_tenant_fk', columns: [table.leadId, table.organizationId], foreignColumns: [leads.id, leads.organizationId] }).onDelete('cascade'),
  index('lead_status_history_org_lead_idx').on(table.organizationId, table.leadId, table.changedAt),
]);

export const tasks = pgTable('tasks', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull(),
  title: text('title').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  status: taskStatus('status').default('open').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  assignedToUserId: uuid('assigned_to_user_id').references(() => authUser.id, { onDelete: 'restrict' }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  completionResult: text('completion_result'),
  completionNote: text('completion_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'tasks_lead_tenant_fk', columns: [table.leadId, table.organizationId], foreignColumns: [leads.id, leads.organizationId] }).onDelete('cascade'),
  check('tasks_completion_result_check', sql`${table.completionResult} is null or ${table.completionResult} in ('completed', 'contacted', 'no_response', 'follow_up')`),
  index('tasks_org_status_due_idx').on(table.organizationId, table.status, table.dueAt),
  index('tasks_org_lead_status_idx').on(table.organizationId, table.leadId, table.status),
  index('tasks_org_assignee_status_due_idx').on(table.organizationId, table.assignedToUserId, table.status, table.dueAt),
]);

export const opportunities = pgTable('opportunities', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull(),
  accountId: uuid('account_id').notNull(),
  primaryPersonId: uuid('primary_person_id').notNull(),
  name: text('name').notNull(),
  stage: opportunityStage('stage').default('qualification').notNull(),
  ownerUserId: uuid('owner_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  amount: numeric('amount', { precision: 14, scale: 2 }),
  currency: text('currency'),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  lossReason: text('loss_reason'),
  nextAction: text('next_action'),
  nextActionAt: timestamp('next_action_at', { withTimezone: true }),
  stageChangedAt: timestamp('stage_changed_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'opportunities_lead_tenant_fk', columns: [table.leadId, table.organizationId], foreignColumns: [leads.id, leads.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'opportunities_account_tenant_fk', columns: [table.accountId, table.organizationId], foreignColumns: [accounts.id, accounts.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'opportunities_person_tenant_fk', columns: [table.primaryPersonId, table.organizationId], foreignColumns: [people.id, people.organizationId] }).onDelete('cascade'),
  unique('opportunities_id_organization_unique').on(table.id, table.organizationId),
  unique('opportunities_org_lead_unique').on(table.organizationId, table.leadId),
  index('opportunities_org_stage_updated_idx').on(table.organizationId, table.stage, table.updatedAt),
  index('opportunities_org_owner_stage_idx').on(table.organizationId, table.ownerUserId, table.stage),
  index('opportunities_org_next_action_idx').on(table.organizationId, table.nextActionAt),
]);

export const opportunityStageHistory = pgTable('opportunity_stage_history', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  opportunityId: uuid('opportunity_id').notNull(),
  fromStage: opportunityStage('from_stage'),
  toStage: opportunityStage('to_stage').notNull(),
  actorUserId: uuid('actor_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  reason: text('reason'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'opportunity_stage_history_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  index('opportunity_stage_history_org_opportunity_idx').on(table.organizationId, table.opportunityId, table.occurredAt),
]);

export const activities = pgTable('activities', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').notNull(),
  type: activityType('type').notNull(),
  subject: text('subject').notNull(),
  details: text('details'),
  result: text('result'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'activities_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  index('activities_org_opportunity_occurred_idx').on(table.organizationId, table.opportunityId, table.occurredAt),
]);

export const handoffs = pgTable('handoffs', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').notNull(),
  status: handoffStatus('status').default('requested').notNull(),
  reason: text('reason').notNull(),
  evidence: text('evidence').notNull(),
  confirmedFacts: jsonb('confirmed_facts').$type<string[]>().notNull(),
  unknowns: jsonb('unknowns').$type<string[]>().notNull(),
  nextStep: text('next_step').notNull(),
  nextStepAt: timestamp('next_step_at', { withTimezone: true }).notNull(),
  requestedByUserId: uuid('requested_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  acceptedByUserId: uuid('accepted_by_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  returnReason: text('return_reason'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).defaultNow().notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'handoffs_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  unique('handoffs_id_organization_unique').on(table.id, table.organizationId),
  index('handoffs_org_status_requested_idx').on(table.organizationId, table.status, table.requestedAt),
]);

export const handoffHistory = pgTable('handoff_history', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  handoffId: uuid('handoff_id').notNull(),
  event: handoffEventType('event').notNull(),
  actorUserId: uuid('actor_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  note: text('note'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'handoff_history_handoff_tenant_fk', columns: [table.handoffId, table.organizationId], foreignColumns: [handoffs.id, handoffs.organizationId] }).onDelete('cascade'),
  index('handoff_history_org_handoff_idx').on(table.organizationId, table.handoffId, table.occurredAt),
]);


export const messagingChannels = pgTable('messaging_channels', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  displayName: text('display_name').notNull(),
  phoneNumber: text('phone_number').notNull(),
  providerChannelId: text('provider_channel_id').notNull(),
  providerAccountId: text('provider_account_id'),
  credentialsCiphertext: text('credentials_ciphertext'),
  credentialsIv: text('credentials_iv'),
  credentialsAuthTag: text('credentials_auth_tag'),
  chatwootInboxId: text('chatwoot_inbox_id'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('messaging_channels_provider_check', sql`${table.provider} in ('evolution', 'whatsapp_cloud_api')`),
  check('messaging_channels_phone_e164_check', sql`${table.phoneNumber} ~ '^\\+[1-9][0-9]{7,14}$'`),
  unique('messaging_channels_id_organization_unique').on(table.id, table.organizationId),
  unique('messaging_channels_org_phone_unique').on(table.organizationId, table.phoneNumber),
  unique('messaging_channels_org_provider_channel_unique').on(table.organizationId, table.provider, table.providerChannelId),
  unique('messaging_channels_org_chatwoot_inbox_unique').on(table.organizationId, table.chatwootInboxId),
  index('messaging_channels_org_active_idx').on(table.organizationId, table.isActive),
]);

export const agentSettings = pgTable('agent_settings', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  agentKey: text('agent_key').notNull(),
  enabled: boolean('enabled').default(false).notNull(),
  model: text('model').default('claude-haiku-4-5-20251001').notNull(),
  systemPrompt: text('system_prompt').default('').notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('agent_settings_org_agent_unique').on(table.organizationId, table.agentKey),
  check('agent_settings_agent_key_check', sql`${table.agentKey} in ('sofia')`),
  check('agent_settings_model_check', sql`${table.model} in ('claude-haiku-4-5-20251001')`),
  check('agent_settings_prompt_length_check', sql`length(${table.systemPrompt}) <= 30000`),
  index('agent_settings_org_enabled_idx').on(table.organizationId, table.enabled),
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalConversationId: text('external_conversation_id').notNull(),
  channelId: uuid('channel_id'),
  accountId: uuid('account_id'),
  personId: uuid('person_id'),
  opportunityId: uuid('opportunity_id'),
  status: conversationStatus('status').default('open').notNull(),
  ownerUserId: uuid('owner_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  automationMode: text('automation_mode').default('sofia').notNull(),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'conversations_account_tenant_fk', columns: [table.accountId, table.organizationId], foreignColumns: [accounts.id, accounts.organizationId] }).onDelete('restrict'),
  foreignKey({ name: 'conversations_person_tenant_fk', columns: [table.personId, table.organizationId], foreignColumns: [people.id, people.organizationId] }).onDelete('restrict'),
  foreignKey({ name: 'conversations_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('restrict'),
  foreignKey({ name: 'conversations_channel_tenant_fk', columns: [table.channelId, table.organizationId], foreignColumns: [messagingChannels.id, messagingChannels.organizationId] }).onDelete('restrict'),
  unique('conversations_id_organization_unique').on(table.id, table.organizationId),
  unique('conversations_provider_external_unique').on(table.organizationId, table.provider, table.externalConversationId),
  check('conversations_automation_mode_check', sql`${table.automationMode} in ('sofia', 'human', 'paused')`),
  index('conversations_org_status_last_message_idx').on(table.organizationId, table.status, table.lastMessageAt),
  index('conversations_org_owner_last_message_idx').on(table.organizationId, table.ownerUserId, table.lastMessageAt),
  index('conversations_org_channel_last_message_idx').on(table.organizationId, table.channelId, table.lastMessageAt),
]);

export const conversationReads = pgTable('conversation_reads', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  userId: uuid('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'conversation_reads_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  unique('conversation_reads_org_conversation_user_unique').on(table.organizationId, table.conversationId, table.userId),
  index('conversation_reads_org_user_read_idx').on(table.organizationId, table.userId, table.lastReadAt),
]);

export const conversationTags = pgTable('conversation_tags', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('conversation_tags_id_organization_unique').on(table.id, table.organizationId),
  unique('conversation_tags_org_normalized_name_unique').on(table.organizationId, table.normalizedName),
  index('conversation_tags_org_name_idx').on(table.organizationId, table.name),
]);

export const conversationTagLinks = pgTable('conversation_tag_links', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  tagId: uuid('tag_id').notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'conversation_tag_links_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'conversation_tag_links_tag_tenant_fk', columns: [table.tagId, table.organizationId], foreignColumns: [conversationTags.id, conversationTags.organizationId] }).onDelete('cascade'),
  unique('conversation_tag_links_org_conversation_tag_unique').on(table.organizationId, table.conversationId, table.tagId),
  index('conversation_tag_links_org_tag_conversation_idx').on(table.organizationId, table.tagId, table.conversationId),
]);

export const messages = pgTable('messages', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  externalMessageId: text('external_message_id'),
  direction: messageDirection('direction').notNull(),
  actorType: messageActorType('actor_type').notNull(),
  actorUserId: uuid('actor_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  bodyText: text('body_text'),
  deliveryState: messageDeliveryState('delivery_state').default('unknown').notNull(),
  idempotencyKey: text('idempotency_key'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'messages_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  unique('messages_id_organization_unique').on(table.id, table.organizationId),
  unique('messages_conversation_external_unique').on(table.organizationId, table.conversationId, table.externalMessageId),
  unique('messages_conversation_idempotency_unique').on(table.organizationId, table.conversationId, table.idempotencyKey),
  index('messages_org_conversation_occurred_idx').on(table.organizationId, table.conversationId, table.occurredAt),
  index('messages_org_conversation_direction_created_idx').on(table.organizationId, table.conversationId, table.direction, table.createdAt),
]);

export const externalRecords = pgTable('external_records', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  recordType: text('record_type').notNull(),
  externalId: text('external_id').notNull(),
  accountId: uuid('account_id'),
  personId: uuid('person_id'),
  leadId: uuid('lead_id'),
  opportunityId: uuid('opportunity_id'),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
  firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  payloadHash: text('payload_hash'),
}, (table) => [
  foreignKey({ name: 'external_records_account_tenant_fk', columns: [table.accountId, table.organizationId], foreignColumns: [accounts.id, accounts.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'external_records_person_tenant_fk', columns: [table.personId, table.organizationId], foreignColumns: [people.id, people.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'external_records_lead_tenant_fk', columns: [table.leadId, table.organizationId], foreignColumns: [leads.id, leads.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'external_records_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  check('external_records_single_entity_check', sql`num_nonnulls(${table.accountId}, ${table.personId}, ${table.leadId}, ${table.opportunityId}) = 1`),
  unique('external_records_org_provider_type_external_unique').on(table.organizationId, table.provider, table.recordType, table.externalId),
  index('external_records_org_provider_idx').on(table.organizationId, table.provider),
]);

export const closerEvents = pgTable('closer_events', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  priority: text('priority').notNull(),
  status: text('status').default('new').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  opportunityId: uuid('opportunity_id').notNull(),
  sourceMessageId: uuid('source_message_id').notNull(),
  assignedToUserId: uuid('assigned_to_user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  evidence: text('evidence'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'closer_events_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'closer_events_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'closer_events_message_tenant_fk', columns: [table.sourceMessageId, table.organizationId], foreignColumns: [messages.id, messages.organizationId] }).onDelete('cascade'),
  unique('closer_events_org_idempotency_unique').on(table.organizationId, table.idempotencyKey),
  index('closer_events_org_assignee_status_time_idx').on(table.organizationId, table.assignedToUserId, table.status, table.occurredAt),
]);


export const inboxEvents = pgTable('inbox_events', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalEventId: text('external_event_id').notNull(),
  eventType: text('event_type').notNull(),
  payloadHash: text('payload_hash').notNull(),
  payloadRedacted: jsonb('payload_redacted').$type<JsonValue>().notNull(),
  status: eventProcessingState('status').default('pending').notNull(),
  attempts: numeric('attempts').default('0').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
}, (table) => [
  unique('inbox_events_provider_external_unique').on(table.organizationId, table.provider, table.externalEventId),
  index('inbox_events_org_status_received_idx').on(table.organizationId, table.status, table.receivedAt),
]);

export const outboxEvents = pgTable('outbox_events', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  payload: jsonb('payload').$type<JsonValue>().notNull(),
  status: outboxState('status').default('pending').notNull(),
  attempts: numeric('attempts').default('0').notNull(),
  availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('outbox_events_org_idempotency_unique').on(table.organizationId, table.idempotencyKey),
  index('outbox_events_org_status_available_idx').on(table.organizationId, table.status, table.availableAt),
  index('outbox_events_org_aggregate_idx').on(table.organizationId, table.aggregateType, table.aggregateId),
]);

export const jobs = pgTable('jobs', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  jobType: text('job_type').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  status: jobState('status').default('queued').notNull(),
  attempts: numeric('attempts').default('0').notNull(),
  availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  lockedBy: text('locked_by'),
  lastErrorCode: text('last_error_code'),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('jobs_org_idempotency_unique').on(table.organizationId, table.idempotencyKey),
  index('jobs_org_status_available_idx').on(table.organizationId, table.status, table.availableAt),
  index('jobs_org_aggregate_idx').on(table.organizationId, table.aggregateType, table.aggregateId),
]);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  actorUserId: uuid('actor_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  actorType: text('actor_type').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id'),
  reason: text('reason'),
  beforeState: jsonb('before_state').$type<JsonValue>(),
  afterState: jsonb('after_state').$type<JsonValue>(),
  correlationId: text('correlation_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('audit_events_org_entity_time_idx').on(table.organizationId, table.entityType, table.entityId, table.occurredAt),
  index('audit_events_org_actor_time_idx').on(table.organizationId, table.actorUserId, table.occurredAt),
]);
