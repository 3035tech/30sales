import { sql } from 'drizzle-orm';
import { foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { organization as authOrganization, user as authUser } from './auth-schema';

export const leadStatus = pgEnum('lead_status', ['new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact']);
export const leadSource = pgEnum('lead_source', ['manual', 'import', 'whatsapp', 'referral']);

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
