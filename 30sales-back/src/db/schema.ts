import { sql } from 'drizzle-orm';
import { check, foreignKey, index, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'tasks_lead_tenant_fk', columns: [table.leadId, table.organizationId], foreignColumns: [leads.id, leads.organizationId] }).onDelete('cascade'),
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


export const conversations = pgTable('conversations', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalConversationId: text('external_conversation_id').notNull(),
  accountId: uuid('account_id'),
  personId: uuid('person_id'),
  opportunityId: uuid('opportunity_id'),
  status: conversationStatus('status').default('open').notNull(),
  ownerUserId: uuid('owner_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'conversations_account_tenant_fk', columns: [table.accountId, table.organizationId], foreignColumns: [accounts.id, accounts.organizationId] }).onDelete('restrict'),
  foreignKey({ name: 'conversations_person_tenant_fk', columns: [table.personId, table.organizationId], foreignColumns: [people.id, people.organizationId] }).onDelete('restrict'),
  foreignKey({ name: 'conversations_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('restrict'),
  unique('conversations_id_organization_unique').on(table.id, table.organizationId),
  unique('conversations_provider_external_unique').on(table.organizationId, table.provider, table.externalConversationId),
  index('conversations_org_status_last_message_idx').on(table.organizationId, table.status, table.lastMessageAt),
  index('conversations_org_owner_last_message_idx').on(table.organizationId, table.ownerUserId, table.lastMessageAt),
]);

export const messages = pgTable('messages', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  externalMessageId: text('external_message_id'),
  direction: messageDirection('direction').notNull(),
  actorType: messageActorType('actor_type').notNull(),
  bodyText: text('body_text'),
  deliveryState: messageDeliveryState('delivery_state').default('unknown').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'messages_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  unique('messages_id_organization_unique').on(table.id, table.organizationId),
  unique('messages_conversation_external_unique').on(table.organizationId, table.conversationId, table.externalMessageId),
  index('messages_org_conversation_occurred_idx').on(table.organizationId, table.conversationId, table.occurredAt),
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
