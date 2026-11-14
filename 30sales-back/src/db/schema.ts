import { sql } from 'drizzle-orm';
import { foreignKey, index, jsonb, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { organization as authOrganization, user as authUser } from './auth-schema';

export const leadStatus = pgEnum('lead_status', ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']);
export const leadSource = pgEnum('lead_source', ['manual', 'import', 'whatsapp', 'referral']);
export const taskStatus = pgEnum('task_status', ['open', 'completed', 'cancelled']);
export const opportunityStage = pgEnum('opportunity_stage', ['qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed', 'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost']);
export const handoffStatus = pgEnum('handoff_status', ['requested', 'accepted', 'returned', 'cancelled']);
export const handoffEventType = pgEnum('handoff_event_type', ['requested', 'accepted', 'returned']);

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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  foreignKey({ name: 'opportunities_lead_tenant_fk', columns: [table.leadId, table.organizationId], foreignColumns: [leads.id, leads.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'opportunities_account_tenant_fk', columns: [table.accountId, table.organizationId], foreignColumns: [accounts.id, accounts.organizationId] }).onDelete('cascade'),
  foreignKey({ name: 'opportunities_person_tenant_fk', columns: [table.primaryPersonId, table.organizationId], foreignColumns: [people.id, people.organizationId] }).onDelete('cascade'),
  unique('opportunities_id_organization_unique').on(table.id, table.organizationId),
  unique('opportunities_org_lead_unique').on(table.organizationId, table.leadId),
  index('opportunities_org_stage_updated_idx').on(table.organizationId, table.stage, table.updatedAt),
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
