import { sql } from 'drizzle-orm';
import { boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { member as authMember, organization as authOrganization, user as authUser } from './auth-schema';
import { ACCOUNT_INDUSTRIES, ACCOUNT_MARKET_SEGMENTS } from '../accounts/accounts.constants';
import { ASSISTANT_DELIVERY_OUTCOME_VALUES, ASSISTANT_INTENT_VALUES, ASSISTANT_PRICING_VERSION, ASSISTANT_RUN_OPERATION_VALUES, ASSISTANT_RUN_OPERATIONS, ASSISTANT_RUN_PROVIDER_VALUES, ASSISTANT_RUN_STATUS_VALUES, ASSISTANT_RUNTIME_PROVIDER, ASSISTANT_STOP_REASON_VALUES } from '../agents/assistant-runtime.constants';
import { CONTACT_OUTREACH_BASES, CONTACT_OUTREACH_DECISION, CONTACT_OUTREACH_DECISIONS, LEAD_QUALIFICATION_FACT_CONFIDENCE_MAX, LEAD_QUALIFICATION_FACT_CONFIDENCE_MIN, LEAD_QUALIFICATION_FACT_MAX_KEY_LENGTH, LEAD_QUALIFICATION_FACT_MAX_VALUE_LENGTH, LEAD_QUALIFICATION_FACT_MIN_KEY_LENGTH, LEAD_QUALIFICATION_FACT_MIN_VALUE_LENGTH, LEAD_QUALIFICATION_FACT_SOURCE, LEAD_QUALIFICATION_FACT_SOURCES, LEAD_QUALIFICATION_FACT_STATE, LEAD_QUALIFICATION_FACT_STATES } from '../leads/constants';
import { CAMPAIGN_DRAFT_STATUSES, CAMPAIGN_OPENING_MESSAGE_DEFAULT } from '../campaigns/campaigns.constants';
import { CHANNEL_ASSISTANT_SCHEDULE_MODES, CHANNEL_CONNECTION_STATUSES, CHANNEL_DAILY_LIMIT_TIME_ZONE_DEFAULT, CHANNEL_DAILY_MESSAGE_LIMIT_DEFAULT, CHANNEL_OPERATION_MODES } from '../channels/channels.constants';
import { BUSINESS_LINE_STATUSES } from '../business-lines/business-lines.constants';
import { ACCOUNT_PERSON_STATUSES, ACCOUNT_PERSON_STATUS } from '../accounts/accounts.constants';
import { OPPORTUNITY_CREATION_MODES } from '../opportunities/opportunities.constants';

export const leadStatus = pgEnum('lead_status', ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']);
export const leadSource = pgEnum('lead_source', ['manual', 'import', 'whatsapp', 'referral']);
export const contactOutreachDecision = pgEnum('contact_outreach_decision', CONTACT_OUTREACH_DECISIONS);
export const contactOutreachBasis = pgEnum('contact_outreach_basis', CONTACT_OUTREACH_BASES);
export const leadQualificationFactState = pgEnum('lead_qualification_fact_state', LEAD_QUALIFICATION_FACT_STATES);
export const leadQualificationFactSource = pgEnum('lead_qualification_fact_source', LEAD_QUALIFICATION_FACT_SOURCES);
export const accountPersonStatus = pgEnum('account_person_status', ACCOUNT_PERSON_STATUSES);
export const campaignDraftStatus = pgEnum('campaign_draft_status', CAMPAIGN_DRAFT_STATUSES);
export const accountMarketSegment = pgEnum('account_market_segment', ACCOUNT_MARKET_SEGMENTS);
export const accountIndustry = pgEnum('account_industry', ACCOUNT_INDUSTRIES);
export const taskStatus = pgEnum('task_status', ['open', 'completed', 'cancelled']);
export const opportunityStage = pgEnum('opportunity_stage', ['qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost', 'custom']);
export const opportunityCreationMode = pgEnum('opportunity_creation_mode', OPPORTUNITY_CREATION_MODES);
export const handoffStatus = pgEnum('handoff_status', ['requested', 'accepted', 'returned', 'cancelled']);
export const handoffEventType = pgEnum('handoff_event_type', ['requested', 'accepted', 'returned']);
export const activityType = pgEnum('activity_type', ['call', 'meeting', 'email', 'message', 'task', 'note', 'research']);
export const conversationStatus = pgEnum('conversation_status', ['open', 'pending', 'resolved', 'snoozed']);
export const messageDirection = pgEnum('message_direction', ['inbound', 'outbound', 'internal']);
export const messageActorType = pgEnum('message_actor_type', ['contact', 'user', 'assistant', 'system']);
export const messageDeliveryState = pgEnum('message_delivery_state', ['received', 'requested', 'accepted', 'delivered', 'read', 'failed', 'unknown']);
export const mediaAttachmentProvider = pgEnum('media_attachment_provider', ['evolution', 'whatsapp_cloud_api']);
export const mediaAttachmentType = pgEnum('media_attachment_type', ['image', 'video', 'audio', 'document', 'sticker']);
export const mediaAttachmentStatus = pgEnum('media_attachment_status', ['pending', 'processing', 'available', 'failed']);
export const eventProcessingState = pgEnum('event_processing_state', ['pending', 'processing', 'processed', 'failed']);
export const outboxState = pgEnum('outbox_state', ['pending', 'processing', 'published', 'failed']);
export const jobState = pgEnum('job_state', ['queued', 'running', 'completed', 'failed']);
export const assistantRunStatus = pgEnum('assistant_run_status', ASSISTANT_RUN_STATUS_VALUES);
export const assistantStopReason = pgEnum('assistant_stop_reason', ASSISTANT_STOP_REASON_VALUES);
export const assistantIntent = pgEnum('assistant_intent', ASSISTANT_INTENT_VALUES);
export const assistantRunProvider = pgEnum('assistant_run_provider', ASSISTANT_RUN_PROVIDER_VALUES);
export const assistantRunOperation = pgEnum('assistant_run_operation', ASSISTANT_RUN_OPERATION_VALUES);
export const assistantDeliveryOutcome = pgEnum('assistant_delivery_outcome', ASSISTANT_DELIVERY_OUTCOME_VALUES);
export const businessLineStatus = pgEnum('business_line_status', BUSINESS_LINE_STATUSES);
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type MessageProviderMetadata = {
  evolution?: {
    source?: 'provider_echo';
    reaction?: { targetExternalMessageId: string; emoji: string } | null;
    encryptedReaction?: { targetExternalMessageId: string } | null;
    quotedMessage?: { externalMessageId: string | null; bodyText: string | null } | null;
    richContent?: { kind: 'poll'; title: string; options: string[]; resultsStatus?: 'pending' | 'available' | 'unsupported' | 'failed' | 'unavailable'; results?: { updatedAt: string; options: Array<{ name: string; count: number; voters: Array<{ id: string; name: string | null; phone: string | null }> }> } } | { kind: 'card'; title: string | null; body: string | null; buttonLabel: string | null; buttonUrl: string | null } | null;
    author?: { name: string | null; phone: string | null } | null;
  } | null;
};

export const accountSegments = pgTable('account_segments', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('account_segments_id_organization_unique').on(table.id, table.organizationId),
  uniqueIndex('account_segments_org_name_unique').on(table.organizationId, sql`lower(trim(${table.name}))`),
  check('account_segments_name_length_check', sql`length(trim(${table.name})) between 2 and 80`),
]);

export const businessLines = pgTable('business_lines', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  status: businessLineStatus('status').default('active').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('business_lines_id_organization_unique').on(table.id, table.organizationId),
  uniqueIndex('business_lines_org_slug_unique').on(table.organizationId, table.slug),
  uniqueIndex('business_lines_org_default_unique').on(table.organizationId).where(sql`${table.isDefault} = true`),
  check('business_lines_name_length_check', sql`length(trim(${table.name})) between 2 and 100`),
  check('business_lines_slug_check', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(${table.slug}) <= 80`),
  check('business_lines_description_length_check', sql`${table.description} is null or length(${table.description}) <= 500`),
  index('business_lines_org_status_name_idx').on(table.organizationId, table.status, table.name),
]);

export const businessLineMembers = pgTable('business_line_members', {
  organizationId: uuid('organization_id').notNull(),
  businessLineId: uuid('business_line_id').notNull(),
  memberId: uuid('member_id').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: 'business_line_members_pk', columns: [table.organizationId, table.businessLineId, table.memberId] }),
  foreignKey({ name: 'business_line_members_line_tenant_fk', columns: [table.organizationId, table.businessLineId], foreignColumns: [businessLines.organizationId, businessLines.id] }).onDelete('cascade'),
  foreignKey({ name: 'business_line_members_member_tenant_fk', columns: [table.organizationId, table.memberId], foreignColumns: [authMember.organizationId, authMember.id] }).onDelete('cascade'),
  index('business_line_members_org_member_idx').on(table.organizationId, table.memberId),
]);

export const accounts = pgTable('accounts', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  taxId: text('tax_id'),
  phone: text('phone'),
  address: text('address'),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  addressPostalCode: text('address_postal_code'),
  addressCity: text('address_city'),
  addressState: text('address_state'),
  addressCountry: text('address_country'),
  industry: accountIndustry('industry'),
  segmentId: uuid('segment_id'),
  marketSegment: accountMarketSegment('market_segment'),
  studentCount: integer('student_count'),
  employeeCount: integer('employee_count'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'accounts_segment_tenant_fk', columns: [table.segmentId, table.organizationId], foreignColumns: [accountSegments.id, accountSegments.organizationId] }),
  unique('accounts_id_organization_unique').on(table.id, table.organizationId),
  check('accounts_student_count_check', sql`${table.studentCount} is null or ${table.studentCount} >= 0`),
  check('accounts_employee_count_check', sql`${table.employeeCount} is null or ${table.employeeCount} >= 0`),
  index('accounts_org_name_idx').on(table.organizationId, table.name),
  index('accounts_org_segment_idx').on(table.organizationId, table.segmentId),
]);

export const people = pgTable('people', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email'),
  phone: text('phone'),
  profilePictureKey: text('profile_picture_key'),
  profilePictureMimeType: text('profile_picture_mime_type'),
  profilePictureFetchedAt: timestamp('profile_picture_fetched_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [unique('people_id_organization_unique').on(table.id, table.organizationId), index('people_org_email_idx').on(table.organizationId, table.email), index('people_org_phone_idx').on(table.organizationId, table.phone)]);

export const accountPeople = pgTable('account_people', {
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  accountId: uuid('account_id').notNull(),
  personId: uuid('person_id').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  status: accountPersonStatus('status').default(ACCOUNT_PERSON_STATUS.active).notNull(),
  revokedByUserId: uuid('revoked_by_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: 'account_people_pk', columns: [table.organizationId, table.accountId, table.personId] }),
  foreignKey({ name: 'account_people_account_tenant_fk', columns: [table.accountId, table.organizationId], foreignColumns: [accounts.id, accounts.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'account_people_person_tenant_fk', columns: [table.personId, table.organizationId], foreignColumns: [people.id, people.organizationId] }).onDelete('cascade'),
  index('account_people_org_person_idx').on(table.organizationId, table.personId),
  index('account_people_org_account_status_idx').on(table.organizationId, table.accountId, table.status),
  check('account_people_revocation_check', sql`(${table.status} = ${sql.raw(`'${ACCOUNT_PERSON_STATUS.active}'`)} and ${table.revokedAt} is null) or (${table.status} = ${sql.raw(`'${ACCOUNT_PERSON_STATUS.revoked}'`)} and ${table.revokedAt} is not null)`),
]);

export const leads = pgTable('leads', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  businessLineId: uuid('business_line_id'),
  accountId: uuid('account_id').notNull(),
  personId: uuid('person_id'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  assignedToUserId: uuid('assigned_to_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  source: leadSource('source').default('manual').notNull(),
  status: leadStatus('status').default('new').notNull(),
  nextActionAt: timestamp('next_action_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'leads_account_tenant_fk', columns: [table.accountId, table.organizationId], foreignColumns: [accounts.id, accounts.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'leads_business_line_tenant_fk', columns: [table.businessLineId, table.organizationId], foreignColumns: [businessLines.id, businessLines.organizationId] }).onDelete('restrict'),
  foreignKey({ name: 'leads_person_tenant_fk', columns: [table.personId, table.organizationId], foreignColumns: [people.id, people.organizationId] }).onDelete('cascade'),
  unique('leads_id_organization_unique').on(table.id, table.organizationId),
  index('leads_org_status_next_action_idx').on(table.organizationId, table.status, table.nextActionAt),
  index('leads_org_business_line_status_idx').on(table.organizationId, table.businessLineId, table.status),
  index('leads_org_created_idx').on(table.organizationId, table.createdAt),
  index('leads_org_assignee_status_idx').on(table.organizationId, table.assignedToUserId, table.status),
]);

export const leadContacts = pgTable('lead_contacts', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull(),
  personId: uuid('person_id').notNull(),
  jobTitle: text('job_title'),
  isPrimary: boolean('is_primary').default(false).notNull(),
  isInterested: boolean('is_interested').default(false).notNull(),
  outreachDecision: contactOutreachDecision('outreach_decision').default(CONTACT_OUTREACH_DECISION.pending).notNull(),
  outreachBasis: contactOutreachBasis('outreach_basis'),
  outreachEvidence: text('outreach_evidence'),
  outreachReviewedByUserId: uuid('outreach_reviewed_by_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  outreachReviewedAt: timestamp('outreach_reviewed_at', { withTimezone: true }),
  referralNote: text('referral_note'),
  notes: text('notes'),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'lead_contacts_lead_tenant_fk', columns: [table.leadId, table.organizationId], foreignColumns: [leads.id, leads.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'lead_contacts_person_tenant_fk', columns: [table.personId, table.organizationId], foreignColumns: [people.id, people.organizationId] }).onDelete('cascade'),
  unique('lead_contacts_id_organization_unique').on(table.id, table.organizationId),
  unique('lead_contacts_lead_person_unique').on(table.leadId, table.personId),
  uniqueIndex('lead_contacts_primary_unique').on(table.organizationId, table.leadId).where(sql`${table.isPrimary}`),
  check('lead_contacts_job_title_length_check', sql`${table.jobTitle} is null or length(${table.jobTitle}) <= 120`),
  check('lead_contacts_referral_note_length_check', sql`${table.referralNote} is null or length(${table.referralNote}) <= 500`),
  check('lead_contacts_notes_length_check', sql`${table.notes} is null or length(${table.notes}) <= 2000`),
  check('lead_contacts_outreach_evidence_length_check', sql`${table.outreachEvidence} is null or length(${table.outreachEvidence}) <= 2000`),
  check('lead_contacts_outreach_review_check', sql`(${table.outreachDecision} = 'pending' and ${table.outreachBasis} is null and ${table.outreachEvidence} is null and ${table.outreachReviewedAt} is null) or (${table.outreachDecision} <> 'pending' and ${table.outreachBasis} is not null and ${table.outreachEvidence} is not null and ${table.outreachReviewedAt} is not null)`),
  index('lead_contacts_org_lead_idx').on(table.organizationId, table.leadId),
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
  unique('tasks_id_organization_unique').on(table.id, table.organizationId),
  check('tasks_completion_result_check', sql`${table.completionResult} is null or ${table.completionResult} in ('completed', 'contacted', 'no_response', 'follow_up')`),
  index('tasks_org_status_due_idx').on(table.organizationId, table.status, table.dueAt),
  index('tasks_org_lead_status_idx').on(table.organizationId, table.leadId, table.status),
  index('tasks_org_assignee_status_due_idx').on(table.organizationId, table.assignedToUserId, table.status, table.dueAt),
]);

export const pipelines = pgTable('pipelines', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  businessLineId: uuid('business_line_id'),
  name: text('name').notNull(),
  isDefault: boolean('is_default').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('pipelines_organization_id_unique').on(table.organizationId, table.id),
  foreignKey({ name: 'pipelines_business_line_tenant_fk', columns: [table.organizationId, table.businessLineId], foreignColumns: [businessLines.organizationId, businessLines.id] }).onDelete('restrict'),
  uniqueIndex('pipelines_org_line_active_name_unique').on(table.organizationId, table.businessLineId, sql`lower(${table.name})`).where(sql`${table.isActive} = true`),
  uniqueIndex('pipelines_org_line_default_unique').on(table.organizationId, table.businessLineId).where(sql`${table.isDefault} = true`),
  index('pipelines_org_active_idx').on(table.organizationId, table.isActive, table.name),
  index('pipelines_org_line_active_idx').on(table.organizationId, table.businessLineId, table.isActive, table.name),
]);

export const pipelineStages = pgTable('pipeline_stages', {
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  key: text('key').notNull(),
  pipelineId: uuid('pipeline_id'),
  stage: opportunityStage('stage'),
  name: text('name'),
  position: integer('position').notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: 'pipeline_stages_org_key_pk', columns: [table.organizationId, table.key] }),
  foreignKey({ name: 'pipeline_stages_pipeline_tenant_fk', columns: [table.organizationId, table.pipelineId], foreignColumns: [pipelines.organizationId, pipelines.id] }).onDelete('cascade'),
  check('pipeline_stages_name_check', sql`${table.isSystem} or (${table.name} is not null and length(trim(${table.name})) between 2 and 64)`),
  check('pipeline_stages_system_key_check', sql`not ${table.isSystem} or ${table.stage} in ('qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost')`),
  uniqueIndex('pipeline_stages_pipeline_active_name_unique').on(table.organizationId, table.pipelineId, sql`lower(${table.name})`).where(sql`${table.isSystem} = false and ${table.isActive} = true`),
  index('pipeline_stages_org_pipeline_active_position_idx').on(table.organizationId, table.pipelineId, table.isActive, table.position),
]);

export const opportunities = pgTable('opportunities', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull(),
  accountId: uuid('account_id').notNull(),
  primaryPersonId: uuid('primary_person_id'),
  name: text('name').notNull(),
  pipelineId: uuid('pipeline_id'),
  stage: opportunityStage('stage').default('qualification').notNull(),
  pipelineStageKey: text('pipeline_stage_key'),
  ownerUserId: uuid('owner_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdByType: opportunityCreationMode('created_by_type').default('human').notNull(),
  studentCountSnapshot: integer('student_count_snapshot'),
  employeeCountSnapshot: integer('employee_count_snapshot'),
  amount: numeric('amount', { precision: 14, scale: 2 }),
  currency: text('currency'),
  quotedAmount: numeric('quoted_amount', { precision: 14, scale: 2 }),
  quotedCurrency: text('quoted_currency'),
  quotedAt: timestamp('quoted_at', { withTimezone: true }),
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
  foreignKey({ name: 'opportunities_pipeline_tenant_fk', columns: [table.organizationId, table.pipelineId], foreignColumns: [pipelines.organizationId, pipelines.id] }).onDelete('restrict'),
  unique('opportunities_id_organization_unique').on(table.id, table.organizationId),
  unique('opportunities_org_lead_unique').on(table.organizationId, table.leadId),
  foreignKey({ name: 'opportunities_pipeline_stage_tenant_fk', columns: [table.organizationId, table.pipelineStageKey], foreignColumns: [pipelineStages.organizationId, pipelineStages.key] }),
  check('opportunities_custom_stage_check', sql`(${table.stage} = 'custom' and ${table.pipelineStageKey} is not null) or (${table.stage} <> 'custom' and ${table.pipelineStageKey} is null)`),
  index('opportunities_org_stage_updated_idx').on(table.organizationId, table.stage, table.updatedAt),
  index('opportunities_org_pipeline_stage_updated_idx').on(table.organizationId, table.pipelineId, table.stage, table.updatedAt),
  index('opportunities_org_owner_stage_idx').on(table.organizationId, table.ownerUserId, table.stage),
  index('opportunities_org_next_action_idx').on(table.organizationId, table.nextActionAt),
]);

export const opportunityProposals = pgTable('opportunity_proposals', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').notNull(),
  version: integer('version').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  currency: text('currency').notNull(),
  billingTerm: text('billing_term').notNull(),
  sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
  fileName: text('file_name').notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size').notNull(),
  storageKey: text('storage_key').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'opportunity_proposals_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  unique('opportunity_proposals_version_unique').on(table.organizationId, table.opportunityId, table.version),
  index('opportunity_proposals_org_opportunity_created_idx').on(table.organizationId, table.opportunityId, table.createdAt),
  check('opportunity_proposals_billing_term_check', sql`${table.billingTerm} in ('monthly', 'quarterly', 'annual', 'one_time')`),
  check('opportunity_proposals_currency_check', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  check('opportunity_proposals_file_size_check', sql`${table.fileSize} > 0`),
]);

export const opportunityStageHistory = pgTable('opportunity_stage_history', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  opportunityId: uuid('opportunity_id').notNull(),
  fromStage: opportunityStage('from_stage'),
  fromPipelineId: uuid('from_pipeline_id'),
  fromPipelineStageKey: text('from_pipeline_stage_key'),
  toStage: opportunityStage('to_stage').notNull(),
  toPipelineId: uuid('to_pipeline_id'),
  toPipelineStageKey: text('to_pipeline_stage_key'),
  actorUserId: uuid('actor_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  reason: text('reason'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'opportunity_stage_history_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'opportunity_stage_history_from_pipeline_stage_tenant_fk', columns: [table.organizationId, table.fromPipelineStageKey], foreignColumns: [pipelineStages.organizationId, pipelineStages.key] }),
  foreignKey({ name: 'opportunity_stage_history_to_pipeline_stage_tenant_fk', columns: [table.organizationId, table.toPipelineStageKey], foreignColumns: [pipelineStages.organizationId, pipelineStages.key] }),
  foreignKey({ name: 'opportunity_stage_history_from_pipeline_tenant_fk', columns: [table.organizationId, table.fromPipelineId], foreignColumns: [pipelines.organizationId, pipelines.id] }),
  foreignKey({ name: 'opportunity_stage_history_to_pipeline_tenant_fk', columns: [table.organizationId, table.toPipelineId], foreignColumns: [pipelines.organizationId, pipelines.id] }),
  check('opportunity_stage_history_from_custom_stage_check', sql`(${table.fromStage} is null and ${table.fromPipelineStageKey} is null) or (${table.fromStage} = 'custom' and ${table.fromPipelineStageKey} is not null) or (${table.fromStage} is not null and ${table.fromStage} <> 'custom' and ${table.fromPipelineStageKey} is null)`),
  check('opportunity_stage_history_to_custom_stage_check', sql`(${table.toStage} = 'custom' and ${table.toPipelineStageKey} is not null) or (${table.toStage} <> 'custom' and ${table.toPipelineStageKey} is null)`),
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
  requestedByAgent: boolean('requested_by_agent').default(false).notNull(),
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


export const assistantProfiles = pgTable('assistant_profiles', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  businessLineId: uuid('business_line_id').notNull(),
  direction: text('direction').notNull(),
  name: text('name').notNull(),
  enabled: boolean('enabled').default(false).notNull(),
  model: text('model').default('claude-haiku-5-5').notNull(),
  transcribeAudio: boolean('transcribe_audio').default(false).notNull(),
  systemPrompt: text('system_prompt').default('').notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('assistant_profiles_direction_check', sql`${table.direction} in ('inbound', 'outbound')`),
  check('assistant_profiles_name_check', sql`length(trim(${table.name})) between 2 and 120`),
  check('assistant_profiles_model_check', sql`${table.model} in ('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5')`),
  check('assistant_profiles_prompt_length_check', sql`length(${table.systemPrompt}) <= 100000`),
  check('assistant_profiles_enabled_prompt_check', sql`not ${table.enabled} or length(trim(${table.systemPrompt})) >= 100`),
  unique('assistant_profiles_id_tenant_line_unique').on(table.id, table.organizationId, table.businessLineId),
  foreignKey({ name: 'assistant_profiles_business_line_tenant_fk', columns: [table.organizationId, table.businessLineId], foreignColumns: [businessLines.organizationId, businessLines.id] }).onDelete('cascade'),
  uniqueIndex('assistant_profiles_line_direction_name_unique').on(table.organizationId, table.businessLineId, table.direction, sql`lower(${table.name})`),
  index('assistant_profiles_line_direction_enabled_idx').on(table.organizationId, table.businessLineId, table.direction, table.enabled),
]);

export const messagingChannels = pgTable('messaging_channels', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  businessLineId: uuid('business_line_id'),
  inboundAssistantProfileId: uuid('inbound_assistant_profile_id'),
  outboundAssistantProfileId: uuid('outbound_assistant_profile_id'),
  activityOwnerUserId: uuid('activity_owner_user_id'),
  dailyNewContactGoal: integer('daily_new_contact_goal'),
  dailyContinuationGoal: integer('daily_continuation_goal'),
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
  operationMode: text('operation_mode').default('hybrid').notNull(),
  assistantScheduleMode: text('assistant_schedule_mode').default('always').notNull(),
  dailyMessageLimit: integer('daily_message_limit').default(CHANNEL_DAILY_MESSAGE_LIMIT_DEFAULT).notNull(),
  dailyLimitTimeZone: text('daily_limit_time_zone').default(CHANNEL_DAILY_LIMIT_TIME_ZONE_DEFAULT).notNull(),
  connectionStatus: text('connection_status'),
  connectionUpdatedAt: timestamp('connection_updated_at', { withTimezone: true }),
  pairedAt: timestamp('paired_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('messaging_channels_provider_check', sql`${table.provider} in ('evolution', 'whatsapp_cloud_api')`),
  check('messaging_channels_operation_mode_check', sql`${table.operationMode} in (${sql.raw(CHANNEL_OPERATION_MODES.map((mode) => `'${mode}'`).join(', '))})`),
  check('messaging_channels_assistant_schedule_mode_check', sql`${table.assistantScheduleMode} in (${sql.raw(CHANNEL_ASSISTANT_SCHEDULE_MODES.map((mode) => `'${mode}'`).join(', '))})`),
  check('messaging_channels_phone_e164_check', sql`${table.phoneNumber} ~ '^\\+[1-9][0-9]{7,14}$'`),
  check('messaging_channels_daily_message_limit_check', sql`${table.dailyMessageLimit} between 1 and 5000`),
  check('messaging_channels_daily_new_contact_goal_check', sql`${table.dailyNewContactGoal} is null or ${table.dailyNewContactGoal} between 1 and 10000`),
  check('messaging_channels_daily_continuation_goal_check', sql`${table.dailyContinuationGoal} is null or ${table.dailyContinuationGoal} between 1 and 10000`),
  check('messaging_channels_daily_limit_time_zone_check', sql`length(${table.dailyLimitTimeZone}) between 1 and 80`),
  check('messaging_channels_connection_status_check', sql`${table.connectionStatus} is null or ${table.connectionStatus} in (${sql.raw(CHANNEL_CONNECTION_STATUSES.map((status) => `'${status}'`).join(', '))})`),
  unique('messaging_channels_id_organization_unique').on(table.id, table.organizationId),
  foreignKey({ name: 'messaging_channels_business_line_tenant_fk', columns: [table.organizationId, table.businessLineId], foreignColumns: [businessLines.organizationId, businessLines.id] }).onDelete('restrict'),
  foreignKey({ name: 'messaging_channels_inbound_profile_scope_fk', columns: [table.inboundAssistantProfileId, table.organizationId, table.businessLineId], foreignColumns: [assistantProfiles.id, assistantProfiles.organizationId, assistantProfiles.businessLineId] }).onDelete('restrict'),
  foreignKey({ name: 'messaging_channels_outbound_profile_scope_fk', columns: [table.outboundAssistantProfileId, table.organizationId, table.businessLineId], foreignColumns: [assistantProfiles.id, assistantProfiles.organizationId, assistantProfiles.businessLineId] }).onDelete('restrict'),
  uniqueIndex('messaging_channels_org_phone_unique').on(table.organizationId, table.phoneNumber).where(sql`${table.deletedAt} is null`),
  uniqueIndex('messaging_channels_org_provider_channel_unique').on(table.organizationId, table.provider, table.providerChannelId).where(sql`${table.deletedAt} is null`),
  unique('messaging_channels_org_chatwoot_inbox_unique').on(table.organizationId, table.chatwootInboxId),
  index('messaging_channels_org_active_idx').on(table.organizationId, table.isActive),
  index('messaging_channels_org_line_active_idx').on(table.organizationId, table.businessLineId, table.isActive),
]);

export const channelBusinessHours = pgTable('channel_business_hours', {
  organizationId: uuid('organization_id').notNull(),
  channelId: uuid('channel_id').notNull(),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
}, (table) => [
  primaryKey({ name: 'channel_business_hours_pk', columns: [table.organizationId, table.channelId, table.dayOfWeek] }),
  foreignKey({ name: 'channel_business_hours_channel_tenant_fk', columns: [table.channelId, table.organizationId], foreignColumns: [messagingChannels.id, messagingChannels.organizationId] }).onDelete('cascade'),
  check('channel_business_hours_day_check', sql`${table.dayOfWeek} between 0 and 6`),
  check('channel_business_hours_time_check', sql`${table.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.startTime} <> ${table.endTime}`),
]);

export const channelAssistantScheduleExceptions = pgTable('channel_assistant_schedule_exceptions', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull(),
  channelId: uuid('channel_id').notNull(),
  localDate: date('local_date').notNull(),
  assistantEnabled: boolean('assistant_enabled').notNull(),
  startTime: text('start_time'),
  endTime: text('end_time'),
  endDayOffset: integer('end_day_offset'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('channel_assistant_schedule_exceptions_org_channel_date_unique').on(table.organizationId, table.channelId, table.localDate),
  foreignKey({ name: 'channel_assistant_schedule_exceptions_channel_tenant_fk', columns: [table.channelId, table.organizationId], foreignColumns: [messagingChannels.id, messagingChannels.organizationId] }).onDelete('cascade'),
  check('channel_assistant_schedule_exceptions_window_check', sql`(${table.assistantEnabled} and ((${table.startTime} is null and ${table.endTime} is null) or (${table.startTime} is not null and ${table.endTime} is not null and ((${table.endDayOffset} is null and ${table.startTime} < ${table.endTime}) or (${table.endDayOffset} between 0 and 6 and (${table.endDayOffset} > 0 or ${table.startTime} < ${table.endTime})))))) or (not ${table.assistantEnabled} and ${table.startTime} is null and ${table.endTime} is null and (${table.endDayOffset} is null or ${table.endDayOffset} between 0 and 6))`),
  check('channel_assistant_schedule_exceptions_time_format_check', sql`(${table.startTime} is null or ${table.startTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and (${table.endTime} is null or ${table.endTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`),
]);

export const campaignDrafts = pgTable('campaign_drafts', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').notNull(),
  name: text('name').notNull(),
  openingMessage: text('opening_message').default(CAMPAIGN_OPENING_MESSAGE_DEFAULT).notNull(),
  windowStart: text('window_start').notNull(),
  windowEnd: text('window_end').notNull(),
  timeZone: text('time_zone').notNull(),
  dailyMessageLimit: integer('daily_message_limit').notNull(),
  minimumDelaySeconds: integer('minimum_delay_seconds').notNull(),
  status: campaignDraftStatus('status').default(CAMPAIGN_DRAFT_STATUSES[0]).notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'campaign_drafts_channel_tenant_fk', columns: [table.channelId, table.organizationId], foreignColumns: [messagingChannels.id, messagingChannels.organizationId] }).onDelete('restrict'),
  unique('campaign_drafts_id_organization_unique').on(table.id, table.organizationId),
  check('campaign_drafts_name_length_check', sql`length(${table.name}) between 2 and 120`),
  check('campaign_drafts_opening_message_length_check', sql`length(${table.openingMessage}) between 1 and 4096`),
  check('campaign_drafts_window_start_check', sql`${table.windowStart} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  check('campaign_drafts_window_end_check', sql`${table.windowEnd} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  check('campaign_drafts_window_order_check', sql`${table.windowStart} < ${table.windowEnd}`),
  check('campaign_drafts_daily_limit_check', sql`${table.dailyMessageLimit} between 1 and 500`),
  check('campaign_drafts_minimum_delay_check', sql`${table.minimumDelaySeconds} between 5 and 300`),
  check('campaign_drafts_time_zone_length_check', sql`length(${table.timeZone}) between 1 and 80`),
  index('campaign_drafts_org_created_idx').on(table.organizationId, table.createdAt),
]);

export const campaignDraftChannels = pgTable('campaign_draft_channels', {
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  campaignDraftId: uuid('campaign_draft_id').notNull(),
  channelId: uuid('channel_id').notNull(),
  position: integer('position').notNull(),
}, (table) => [
  primaryKey({ name: 'campaign_draft_channels_pk', columns: [table.organizationId, table.campaignDraftId, table.channelId] }),
  foreignKey({ name: 'campaign_draft_channels_draft_tenant_fk', columns: [table.campaignDraftId, table.organizationId], foreignColumns: [campaignDrafts.id, campaignDrafts.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'campaign_draft_channels_channel_tenant_fk', columns: [table.channelId, table.organizationId], foreignColumns: [messagingChannels.id, messagingChannels.organizationId] }).onDelete('restrict'),
  unique('campaign_draft_channels_order_unique').on(table.organizationId, table.campaignDraftId, table.position),
  check('campaign_draft_channels_position_check', sql`${table.position} >= 0`),
  index('campaign_draft_channels_org_channel_idx').on(table.organizationId, table.channelId),
]);

export const campaignDraftAudiences = pgTable('campaign_draft_audiences', {
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  campaignDraftId: uuid('campaign_draft_id').notNull(),
  leadId: uuid('lead_id').notNull(),
  selectedByUserId: uuid('selected_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: 'campaign_draft_audiences_pk', columns: [table.organizationId, table.campaignDraftId, table.leadId] }),
  foreignKey({ name: 'campaign_draft_audiences_draft_tenant_fk', columns: [table.campaignDraftId, table.organizationId], foreignColumns: [campaignDrafts.id, campaignDrafts.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'campaign_draft_audiences_lead_tenant_fk', columns: [table.leadId, table.organizationId], foreignColumns: [leads.id, leads.organizationId] }).onDelete('cascade'),
  index('campaign_draft_audiences_org_draft_idx').on(table.organizationId, table.campaignDraftId, table.createdAt),
]);

export const campaignNoSendDates = pgTable('campaign_no_send_dates', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  date: date('date', { mode: 'string' }).notNull(),
  name: text('name').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('campaign_no_send_dates_org_date_unique').on(table.organizationId, table.date),
  unique('campaign_no_send_dates_id_org_unique').on(table.id, table.organizationId),
  check('campaign_no_send_dates_name_length_check', sql`length(${table.name}) between 2 and 100`),
  index('campaign_no_send_dates_org_date_idx').on(table.organizationId, table.date),
]);

export const agentSettings = pgTable('agent_settings', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  businessLineId: uuid('business_line_id'),
  agentKey: text('agent_key').notNull(),
  enabled: boolean('enabled').default(false).notNull(),
  model: text('model').default('claude-haiku-5-5').notNull(),
  transcribeAudio: boolean('transcribe_audio').default(false).notNull(),
  systemPrompt: text('system_prompt').default('').notNull(),
  updatedByUserId: uuid('updated_by_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'agent_settings_business_line_tenant_fk', columns: [table.organizationId, table.businessLineId], foreignColumns: [businessLines.organizationId, businessLines.id] }).onDelete('cascade'),
  uniqueIndex('agent_settings_org_agent_global_unique').on(table.organizationId, table.agentKey).where(sql`${table.businessLineId} is null`),
  uniqueIndex('agent_settings_org_line_agent_unique').on(table.organizationId, table.businessLineId, table.agentKey).where(sql`${table.businessLineId} is not null`),
  check('agent_settings_agent_key_check', sql`${table.agentKey} in ('assistant')`),
  check('agent_settings_model_check', sql`${table.model} in ('claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5')`),
  check('agent_settings_prompt_length_check', sql`length(${table.systemPrompt}) <= 100000`),
  index('agent_settings_org_enabled_idx').on(table.organizationId, table.enabled),
]);

export const conversations = pgTable('conversations', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  externalConversationId: text('external_conversation_id').notNull(),
  conversationType: text('conversation_type').default('direct').notNull(),
  displayName: text('display_name'),
  providerRecipientId: text('provider_recipient_id'),
  channelId: uuid('channel_id'),
  accountId: uuid('account_id'),
  personId: uuid('person_id'),
  opportunityId: uuid('opportunity_id'),
  status: conversationStatus('status').default('open').notNull(),
  providerArchived: boolean('provider_archived'),
  providerPinned: boolean('provider_pinned'),
  providerUnreadCount: integer('provider_unread_count'),
  providerDeleted: boolean('provider_deleted'),
  ownerUserId: uuid('owner_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  automationMode: text('automation_mode').default('assistant').notNull(),
  assistantQualificationIntent: text('assistant_qualification_intent'),
  assistantQualificationSummary: text('assistant_qualification_summary'),
  assistantConfirmedFacts: jsonb('assistant_confirmed_facts').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  assistantUnknowns: jsonb('assistant_unknowns').$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
  assistantNextStep: text('assistant_next_step'),
  assistantQualificationUpdatedAt: timestamp('assistant_qualification_updated_at', { withTimezone: true }),
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
  check('conversations_automation_mode_check', sql`${table.automationMode} in ('assistant', 'human', 'paused')`),
  check('conversations_type_check', sql`${table.conversationType} in ('direct', 'group')`),
  index('conversations_org_status_last_message_idx').on(table.organizationId, table.status, table.lastMessageAt),
  index('conversations_org_owner_last_message_idx').on(table.organizationId, table.ownerUserId, table.lastMessageAt),
  index('conversations_org_channel_last_message_idx').on(table.organizationId, table.channelId, table.lastMessageAt),
]);

export const conversationGroupParticipants = pgTable('conversation_group_participants', {
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  provider: text('provider').notNull(),
  externalParticipantId: text('external_participant_id').notNull(),
  phone: text('phone'),
  displayName: text('display_name'),
  isAdmin: boolean('is_admin').default(false).notNull(),
  isPresent: boolean('is_present').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'conversation_group_participants_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  unique('conversation_group_participants_org_conversation_provider_participant_unique').on(table.organizationId, table.conversationId, table.provider, table.externalParticipantId),
  index('conversation_group_participants_org_conversation_present_idx').on(table.organizationId, table.conversationId, table.isPresent, table.displayName),
  check('conversation_group_participants_external_id_length_check', sql`length(${table.externalParticipantId}) between 1 and 250`),
]);

export const evolutionGroupMetadata = pgTable('evolution_group_metadata', {
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').notNull(),
  groupJid: text('group_jid').notNull(),
  displayName: text('display_name').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'evolution_group_metadata_channel_tenant_fk', columns: [table.channelId, table.organizationId], foreignColumns: [messagingChannels.id, messagingChannels.organizationId] }).onDelete('cascade'),
  primaryKey({ name: 'evolution_group_metadata_org_channel_jid_pk', columns: [table.organizationId, table.channelId, table.groupJid] }),
  check('evolution_group_metadata_jid_length_check', sql`length(${table.groupJid}) between 1 and 250`),
  check('evolution_group_metadata_display_name_length_check', sql`length(trim(${table.displayName})) between 1 and 160`),
]);

export const opportunityConversationContexts = pgTable('opportunity_conversation_contexts', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').notNull(),
  conversationId: uuid('conversation_id').notNull(),
  summary: text('summary').notNull(),
  confirmedFacts: text('confirmed_facts').array().notNull(),
  unknowns: text('unknowns').array().notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
}, (table) => [
  foreignKey({ name: 'opportunity_conversation_contexts_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'opportunity_conversation_contexts_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  unique('opportunity_conversation_contexts_org_conversation_unique').on(table.organizationId, table.conversationId),
  index('opportunity_conversation_contexts_org_opportunity_captured_idx').on(table.organizationId, table.opportunityId, table.capturedAt),
]);

export const conversationTags = pgTable('conversation_tags', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  normalizedName: text('normalized_name').notNull(),
  color: text('color').notNull().default('#dbeafe'),
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
  origin: text('origin').default('local').notNull(),
  providerLabelId: text('provider_label_id'),
  providerSyncState: text('provider_sync_state').default('local').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'conversation_tag_links_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'conversation_tag_links_tag_tenant_fk', columns: [table.tagId, table.organizationId], foreignColumns: [conversationTags.id, conversationTags.organizationId] }).onDelete('cascade'),
  unique('conversation_tag_links_org_conversation_tag_unique').on(table.organizationId, table.conversationId, table.tagId),
  check('conversation_tag_links_origin_check', sql`${table.origin} in ('local', 'whatsapp', 'both')`),
  check('conversation_tag_links_provider_sync_state_check', sql`${table.providerSyncState} in ('local', 'provider_accepted', 'provider_confirmed', 'failed')`),
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
  providerMetadata: jsonb('provider_metadata').$type<MessageProviderMetadata>(),
  transcriptText: text('transcript_text'),
  isDeleted: boolean('is_deleted').default(false).notNull(),
  deliveryState: messageDeliveryState('delivery_state').default('unknown').notNull(),
  idempotencyKey: text('idempotency_key'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'messages_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  unique('messages_id_organization_unique').on(table.id, table.organizationId),
  unique('messages_conversation_external_unique').on(table.organizationId, table.conversationId, table.externalMessageId),
  unique('messages_conversation_idempotency_unique').on(table.organizationId, table.conversationId, table.idempotencyKey),
  index('messages_org_conversation_occurred_idx').on(table.organizationId, table.conversationId, table.occurredAt, table.id),
  index('messages_org_conversation_direction_created_idx').on(table.organizationId, table.conversationId, table.direction, table.createdAt),
]);

export const conversationReads = pgTable('conversation_reads', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  userId: uuid('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
  lastReadMessageId: uuid('last_read_message_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'conversation_reads_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'conversation_reads_message_tenant_fk', columns: [table.lastReadMessageId, table.organizationId], foreignColumns: [messages.id, messages.organizationId] }),
  unique('conversation_reads_org_conversation_user_unique').on(table.organizationId, table.conversationId, table.userId),
  index('conversation_reads_org_user_read_idx').on(table.organizationId, table.userId, table.lastReadAt),
]);

export const messageHiddenForUsers = pgTable('message_hidden_for_users', {
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').notNull(),
  userId: uuid('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  hiddenAt: timestamp('hidden_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ name: 'message_hidden_for_users_pk', columns: [table.organizationId, table.messageId, table.userId] }),
  foreignKey({ name: 'message_hidden_for_users_message_tenant_fk', columns: [table.messageId, table.organizationId], foreignColumns: [messages.id, messages.organizationId] }).onDelete('cascade'),
  index('message_hidden_for_users_org_user_idx').on(table.organizationId, table.userId, table.messageId),
]);

export const leadQualificationFacts = pgTable('lead_qualification_facts', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  leadId: uuid('lead_id').notNull(),
  factKey: text('fact_key').notNull(),
  value: text('value'),
  state: leadQualificationFactState('state').notNull(),
  source: leadQualificationFactSource('source').default('manual').notNull(),
  evidence: text('evidence'),
  sourceMessageId: uuid('source_message_id'),
  confidence: numeric('confidence', { precision: 4, scale: 3, mode: 'number' }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'lead_qualification_facts_lead_tenant_fk', columns: [table.leadId, table.organizationId], foreignColumns: [leads.id, leads.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'lead_qualification_facts_message_tenant_fk', columns: [table.sourceMessageId, table.organizationId], foreignColumns: [messages.id, messages.organizationId] }).onDelete('cascade'),
  unique('lead_qualification_facts_id_org_unique').on(table.id, table.organizationId),
  check('lead_qualification_facts_key_check', sql`length(${table.factKey}) between ${sql.raw(String(LEAD_QUALIFICATION_FACT_MIN_KEY_LENGTH))} and ${sql.raw(String(LEAD_QUALIFICATION_FACT_MAX_KEY_LENGTH))} and ${table.factKey} ~ '^[a-z][a-z0-9_]*$'`),
  check('lead_qualification_facts_value_check', sql`(${table.state} in (${sql.raw(`'${LEAD_QUALIFICATION_FACT_STATE.unknown}'`)}, ${sql.raw(`'${LEAD_QUALIFICATION_FACT_STATE.notApplicable}'`)}) and ${table.value} is null) or (${table.state} not in (${sql.raw(`'${LEAD_QUALIFICATION_FACT_STATE.unknown}'`)}, ${sql.raw(`'${LEAD_QUALIFICATION_FACT_STATE.notApplicable}'`)}) and ${table.value} is not null and length(trim(${table.value})) between ${sql.raw(String(LEAD_QUALIFICATION_FACT_MIN_VALUE_LENGTH))} and ${sql.raw(String(LEAD_QUALIFICATION_FACT_MAX_VALUE_LENGTH))})`),
  check('lead_qualification_facts_source_check', sql`(${table.source} = ${sql.raw(`'${LEAD_QUALIFICATION_FACT_SOURCE.conversation}'`)} and ${table.sourceMessageId} is not null) or (${table.source} <> ${sql.raw(`'${LEAD_QUALIFICATION_FACT_SOURCE.conversation}'`)} and ${table.sourceMessageId} is null)`),
  check('lead_qualification_facts_confidence_check', sql`${table.confidence} is null or ${table.confidence} between ${sql.raw(String(LEAD_QUALIFICATION_FACT_CONFIDENCE_MIN))} and ${sql.raw(String(LEAD_QUALIFICATION_FACT_CONFIDENCE_MAX))}`),
  check('lead_qualification_facts_evidence_length_check', sql`${table.evidence} is null or length(${table.evidence}) <= ${sql.raw(String(LEAD_QUALIFICATION_FACT_MAX_VALUE_LENGTH))}`),
  index('lead_qualification_facts_org_lead_recorded_idx').on(table.organizationId, table.leadId, table.recordedAt),
]);

export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  messageId: uuid('message_id').notNull(),
  channelId: uuid('channel_id').notNull(),
  provider: mediaAttachmentProvider('provider').notNull(),
  mediaType: mediaAttachmentType('media_type').notNull(),
  sourceMediaId: text('source_media_id'),
  sourceCiphertext: text('source_ciphertext'),
  sourceIv: text('source_iv'),
  sourceAuthTag: text('source_auth_tag'),
  mimeType: text('mime_type'),
  fileName: text('file_name'),
  sizeBytes: integer('size_bytes'),
  sha256: text('sha256'),
  storageKey: text('storage_key'),
  status: mediaAttachmentStatus('status').default('pending').notNull(),
  attemptCount: integer('attempt_count').default(0).notNull(),
  availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  lastErrorStage: text('last_error_stage'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'message_attachments_message_tenant_fk', columns: [table.messageId, table.organizationId], foreignColumns: [messages.id, messages.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'message_attachments_channel_tenant_fk', columns: [table.channelId, table.organizationId], foreignColumns: [messagingChannels.id, messagingChannels.organizationId] }).onDelete('cascade'),
  unique('message_attachments_message_tenant_unique').on(table.messageId, table.organizationId),
  unique('message_attachments_id_organization_unique').on(table.id, table.organizationId),
  check('message_attachments_size_check', sql`${table.sizeBytes} is null or ${table.sizeBytes} between 0 and 1073741824`),
  index('message_attachments_org_status_available_idx').on(table.organizationId, table.status, table.availableAt),
  index('message_attachments_org_message_idx').on(table.organizationId, table.messageId),
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
  dueAt: timestamp('due_at', { withTimezone: true }),
  slaNotifiedAt: timestamp('sla_notified_at', { withTimezone: true }),
  slaEscalateToManagers: boolean('sla_escalate_to_managers').default(false).notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'closer_events_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'closer_events_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'closer_events_message_tenant_fk', columns: [table.sourceMessageId, table.organizationId], foreignColumns: [messages.id, messages.organizationId] }).onDelete('cascade'),
  unique('closer_events_id_organization_unique').on(table.id, table.organizationId),
  unique('closer_events_org_idempotency_unique').on(table.organizationId, table.idempotencyKey),
  index('closer_events_org_assignee_status_time_idx').on(table.organizationId, table.assignedToUserId, table.status, table.occurredAt),
  index('closer_events_org_assignee_status_due_idx').on(table.organizationId, table.assignedToUserId, table.status, table.dueAt),
]);

export const closerEventSlaPolicies = pgTable('closer_event_sla_policies', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  targetMinutes: integer('target_minutes').notNull(),
  escalateToManagers: boolean('escalate_to_managers').default(false).notNull(),
  updatedByUserId: uuid('updated_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  unique('closer_event_sla_policies_org_type_unique').on(table.organizationId, table.eventType),
  check('closer_event_sla_policies_event_type_check', sql`${table.eventType} in ('qualified_handoff', 'human_requested', 'buying_intent', 'closer_question', 'lead_replied_after_handoff', 'interpretation_failure')`),
  check('closer_event_sla_policies_target_minutes_check', sql`${table.targetMinutes} between 1 and 10080`),
]);

export const userNotifications = pgTable('user_notifications', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  recipientUserId: uuid('recipient_user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  closerEventId: uuid('closer_event_id'),
  conversationId: uuid('conversation_id'),
  taskId: uuid('task_id'),
  handoffId: uuid('handoff_id'),
  opportunityId: uuid('opportunity_id'),
  channelId: uuid('channel_id'),
  notificationType: text('notification_type').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'user_notifications_event_tenant_fk', columns: [table.closerEventId, table.organizationId], foreignColumns: [closerEvents.id, closerEvents.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'user_notifications_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'user_notifications_task_tenant_fk', columns: [table.taskId, table.organizationId], foreignColumns: [tasks.id, tasks.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'user_notifications_handoff_tenant_fk', columns: [table.handoffId, table.organizationId], foreignColumns: [handoffs.id, handoffs.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'user_notifications_opportunity_tenant_fk', columns: [table.opportunityId, table.organizationId], foreignColumns: [opportunities.id, opportunities.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'user_notifications_channel_tenant_fk', columns: [table.channelId, table.organizationId], foreignColumns: [messagingChannels.id, messagingChannels.organizationId] }).onDelete('cascade'),
  unique('user_notifications_org_user_idempotency_unique').on(table.organizationId, table.recipientUserId, table.idempotencyKey),
  index('user_notifications_org_user_read_time_idx').on(table.organizationId, table.recipientUserId, table.readAt, table.createdAt),
  check('user_notifications_target_check', sql`num_nonnulls(${table.closerEventId}, ${table.conversationId}, ${table.taskId}, ${table.handoffId}, ${table.opportunityId}, ${table.channelId}) = 1`),
  check('user_notifications_type_check', sql`${table.notificationType} in ('closer_event_sla_overdue', 'closer_event_sla_escalated', 'inbox_new_message', 'task_overdue', 'handoff_accepted', 'handoff_returned', 'conversation_assigned', 'opportunity_assigned', 'channel_disconnected', 'message_delivery_failed', 'media_download_failed')`),
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
  unique('outbox_events_id_organization_unique').on(table.id, table.organizationId),
  unique('outbox_events_org_idempotency_unique').on(table.organizationId, table.idempotencyKey),
  index('outbox_events_org_status_available_idx').on(table.organizationId, table.status, table.availableAt),
  index('outbox_events_org_aggregate_idx').on(table.organizationId, table.aggregateType, table.aggregateId),
]);

export const assistantRuns = pgTable('assistant_runs', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  conversationId: uuid('conversation_id').notNull(),
  inboundMessageId: uuid('inbound_message_id').notNull(),
  outboundMessageId: uuid('outbound_message_id'),
  queueEventId: uuid('queue_event_id').notNull(),
  attempt: integer('attempt').notNull(),
  provider: assistantRunProvider('provider').default(ASSISTANT_RUNTIME_PROVIDER).notNull(),
  operation: assistantRunOperation('operation').default(ASSISTANT_RUN_OPERATIONS.replyGeneration).notNull(),
  modelKey: text('model_key').notNull(),
  promptHash: text('prompt_hash'),
  status: assistantRunStatus('status').default('started').notNull(),
  deliveryOutcome: assistantDeliveryOutcome('delivery_outcome').default('pending').notNull(),
  intent: assistantIntent('intent'),
  usageInputTokens: integer('usage_input_tokens'),
  usageOutputTokens: integer('usage_output_tokens'),
  latencyMs: integer('latency_ms'),
  audioDurationMs: integer('audio_duration_ms'),
  audioSizeBytes: integer('audio_size_bytes'),
  pricingVersion: text('pricing_version').default(ASSISTANT_PRICING_VERSION).notNull(),
  estimatedCostUsd: numeric('estimated_cost_usd', { precision: 18, scale: 10 }),
  stopReason: assistantStopReason('stop_reason'),
  deliveryState: messageDeliveryState('delivery_state'),
  errorCode: text('error_code'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  foreignKey({ name: 'assistant_runs_conversation_tenant_fk', columns: [table.conversationId, table.organizationId], foreignColumns: [conversations.id, conversations.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'assistant_runs_inbound_message_tenant_fk', columns: [table.inboundMessageId, table.organizationId], foreignColumns: [messages.id, messages.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'assistant_runs_outbound_message_tenant_fk', columns: [table.outboundMessageId, table.organizationId], foreignColumns: [messages.id, messages.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'assistant_runs_queue_event_tenant_fk', columns: [table.queueEventId, table.organizationId], foreignColumns: [outboxEvents.id, outboxEvents.organizationId] }).onDelete('cascade'),
  unique('assistant_runs_id_organization_unique').on(table.id, table.organizationId),
  unique('assistant_runs_org_event_attempt_operation_unique').on(table.organizationId, table.queueEventId, table.attempt, table.operation),
  check('assistant_runs_attempt_check', sql`${table.attempt} > 0`),
  check('assistant_runs_usage_check', sql`(${table.usageInputTokens} is null or ${table.usageInputTokens} >= 0) and (${table.usageOutputTokens} is null or ${table.usageOutputTokens} >= 0)`),
  check('assistant_runs_latency_check', sql`${table.latencyMs} is null or ${table.latencyMs} >= 0`),
  check('assistant_runs_prompt_hash_check', sql`${table.promptHash} is null or length(${table.promptHash}) = 64`),
  check('assistant_runs_audio_metrics_check', sql`(${table.audioDurationMs} is null or ${table.audioDurationMs} > 0) and (${table.audioSizeBytes} is null or ${table.audioSizeBytes} > 0)`),
  check('assistant_runs_estimated_cost_check', sql`${table.estimatedCostUsd} is null or ${table.estimatedCostUsd} >= 0`),
  index('assistant_runs_org_started_idx').on(table.organizationId, table.startedAt),
  index('assistant_runs_org_conversation_idx').on(table.organizationId, table.conversationId, table.startedAt),
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

export const evolutionHistoryBatches = pgTable('evolution_history_batches', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => authOrganization.id, { onDelete: 'cascade' }),
  channelId: uuid('channel_id').notNull(),
  externalEventId: text('external_event_id').notNull(),
  payloadCiphertext: text('payload_ciphertext').notNull(),
  payloadIv: text('payload_iv').notNull(),
  payloadAuthTag: text('payload_auth_tag').notNull(),
  status: text('status').default('queued').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  availableAt: timestamp('available_at', { withTimezone: true }).defaultNow().notNull(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  lastErrorCode: text('last_error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'evolution_history_batches_channel_tenant_fk', columns: [table.channelId, table.organizationId], foreignColumns: [messagingChannels.id, messagingChannels.organizationId] }).onDelete('cascade'),
  unique('evolution_history_batches_org_event_unique').on(table.organizationId, table.externalEventId),
  check('evolution_history_batches_status_check', sql`${table.status} in ('queued', 'processing', 'completed', 'failed')`),
  check('evolution_history_batches_attempts_check', sql`${table.attempts} >= 0`),
  index('evolution_history_batches_status_available_idx').on(table.status, table.availableAt),
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

export const platformEvolutionConfiguration = pgTable('platform_evolution_configuration', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  baseUrl: text('base_url').notNull(),
  credentialsCiphertext: text('credentials_ciphertext').notNull(),
  credentialsIv: text('credentials_iv').notNull(),
  credentialsAuthTag: text('credentials_auth_tag').notNull(),
  updatedByUserId: uuid('updated_by_user_id').notNull().references(() => authUser.id, { onDelete: 'restrict' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [check('platform_evolution_configuration_id_check', sql`${table.id} = 'default'`)]);

export const platformAuditEvents = pgTable('platform_audit_events', {
  id: uuid('id').default(sql`pg_catalog.gen_random_uuid()`).primaryKey(),
  actorUserId: uuid('actor_user_id').references(() => authUser.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  beforeState: jsonb('before_state').$type<JsonValue>(),
  afterState: jsonb('after_state').$type<JsonValue>(),
  correlationId: text('correlation_id'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('platform_audit_events_entity_time_idx').on(table.entityType, table.entityId, table.occurredAt),
  index('platform_audit_events_actor_time_idx').on(table.actorUserId, table.occurredAt),
]);
