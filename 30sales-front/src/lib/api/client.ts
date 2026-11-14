import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { z } from 'zod';
import { access, roles, type OrganizationRole } from '../permissions';

const authClient = createAuthClient({ baseURL: import.meta.env.VITE_API_URL ?? '', plugins: [organizationClient({ ac: access, roles })] });
const leadStatus = z.enum(['new','researching','ready','queued','contacting','responded','converted_to_sdr','invalid_contact','no_channel','out_of_profile','duplicate_review','no_response','paused','do_not_contact']);
const leadSchema = z.object({ id: z.string().uuid(), accountName: z.string(), contactName: z.string(), email: z.string().nullable(), phone: z.string().nullable(), source: z.string(), status: leadStatus, nextActionAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(), assignedToUserId: z.string().uuid().nullable(), assignedToName: z.string().nullable() });
const leadDuplicateCandidateSchema = z.object({ id: z.string().uuid(), accountName: z.string(), contactName: z.string(), status: leadStatus, source: z.string(), matchedBy: z.array(z.enum(['account_name', 'email', 'phone'])) });
const leadDuplicateCheckSchema = z.object({ candidates: z.array(leadDuplicateCandidateSchema) });
const leadAssigneeSchema = z.object({ id: z.string().uuid(), name: z.string(), role: z.string() });
const leadPageSchema = z.object({ data: z.array(leadSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const accountPageSchema = z.object({ data: z.array(z.object({ id: z.string().uuid(), name: z.string(), contactCount: z.number(), leadCount: z.number(), respondedCount: z.number(), opportunityCount: z.number(), latestActivityAt: z.string().nullable() })), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const taskResult = z.enum(['completed', 'contacted', 'no_response', 'follow_up']);
const taskSchema = z.object({ id: z.string().uuid(), leadId: z.string().uuid(), title: z.string(), dueAt: z.string(), status: z.enum(['open', 'completed', 'cancelled']), completedAt: z.string().nullable(), accountName: z.string(), contactName: z.string(), completionResult: taskResult.nullable(), completionNote: z.string().nullable() });
const handoffSchema = z.object({ id: z.string().uuid(), opportunityId: z.string().uuid(), leadId: z.string().uuid(), opportunityName: z.string(), accountName: z.string(), contactName: z.string(), status: z.enum(['requested', 'accepted', 'returned']), reason: z.string(), evidence: z.string(), confirmedFacts: z.array(z.string()), unknowns: z.array(z.string()), nextStep: z.string(), nextStepAt: z.string(), requestedByName: z.string(), closerName: z.string().nullable(), returnReason: z.string().nullable(), requestedAt: z.string(), acceptedAt: z.string().nullable(), firstActivityAt: z.string().nullable() });
const closerEventSchema = z.object({ id: z.string().uuid(), eventType: z.string(), priority: z.string(), status: z.string(), conversationId: z.string().uuid(), opportunityId: z.string().uuid(), assignedToUserId: z.string().uuid(), accountName: z.string(), contactName: z.string(), summary: z.string(), evidence: z.string().nullable(), occurredAt: z.string(), acknowledgedAt: z.string().nullable(), snoozedUntil: z.string().nullable() });
const closerEventsPageSchema = z.object({ data: z.array(closerEventSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const opportunityStage = z.enum(['qualification','closer_contact_pending','discovery_scheduled','discovery_done','solution_confirmed','proposal_preparing','proposal_sent','negotiation','won','lost']);
const opportunitySchema = z.object({ id: z.string().uuid(), leadId: z.string().uuid(), name: z.string(), accountName: z.string(), contactName: z.string(), contactEmail: z.string().nullable(), contactPhone: z.string().nullable(), stage: opportunityStage, stageChangedAt: z.string(), ownerUserId: z.string().uuid().nullable(), ownerName: z.string().nullable(), canUpdate: z.boolean(), amount: z.string().nullable(), currency: z.string().nullable(), closedAt: z.string().nullable(), lossReason: z.string().nullable(), nextAction: z.string().nullable(), nextActionAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() });
const opportunityAssigneeSchema = z.object({ id: z.string().uuid(), name: z.string() });
const funnelReportSchema = z.object({ from: z.string(), to: z.string(), currentOpenCount: z.number(), openWithoutNextActionCount: z.number(), overdueNextActionCount: z.number(), currentStages: z.array(z.object({ stage: opportunityStage, count: z.number() })), createdInPeriodCount: z.number(), wonInPeriodCount: z.number(), lostInPeriodCount: z.number(), wonAmountByCurrency: z.array(z.object({ currency: z.string(), amount: z.string() })), acceptedHandoffsInPeriodCount: z.number(), firstActivityCount: z.number(), pendingFirstActivityCount: z.number(), averageMinutesToFirstActivity: z.number().nullable(), leadCountsByStatus: z.array(z.object({ status: leadStatus, count: z.number() })), leadsCreatedInPeriodCount: z.number(), generatedAt: z.string() });
const opportunityHistorySchema = z.object({ id: z.string().uuid(), fromStage: opportunityStage.nullable(), toStage: opportunityStage, actorName: z.string(), reason: z.string().nullable(), occurredAt: z.string() });
const activityType = z.enum(['call','meeting','email','message','task','note','research']);
const activitySchema = z.object({ id: z.string().uuid(), type: activityType, subject: z.string(), details: z.string().nullable(), result: z.string().nullable(), occurredAt: z.string(), actorName: z.string(), createdAt: z.string() });
const conversationStatus = z.enum(['open','pending','resolved','snoozed']);
const channelProvider = z.enum(['evolution','whatsapp_cloud_api']);
const channelSchema = z.object({ id: z.string().uuid(), provider: channelProvider, displayName: z.string(), phoneNumber: z.string(), providerChannelId: z.string(), providerAccountId: z.string().nullable(), isActive: z.boolean(), isConfigured: z.boolean(), createdAt: z.string(), updatedAt: z.string() });
const conversationTagSchema = z.object({ id: z.string().uuid(), name: z.string() });
const conversationSchema = z.object({ id: z.string().uuid(), provider: z.string(), status: conversationStatus, accountName: z.string().nullable(), personName: z.string().nullable(), lastMessageAt: z.string().nullable(), createdAt: z.string(), channelId: z.string().uuid().nullable(), channelName: z.string().nullable(), channelPhoneNumber: z.string().nullable(), channelProvider: channelProvider.nullable(), ownerUserId: z.string().uuid().nullable(), ownerName: z.string().nullable(), automationMode: z.enum(['sofia','human','paused']), replyAvailable: z.boolean(), unread: z.boolean(), tags: z.array(conversationTagSchema) });
const conversationPageSchema = z.object({ data: z.array(conversationSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const messageSchema = z.object({ id: z.string().uuid(), direction: z.enum(['inbound','outbound','internal']), actorType: z.enum(['contact','user','assistant','system']), bodyText: z.string().nullable(), deliveryState: z.enum(['received','requested','accepted','delivered','read','failed','unknown']), occurredAt: z.string(), actorUserId: z.string().uuid().nullable().optional(), actorName: z.string().nullable().optional() });
const auditEventSchema = z.object({ id: z.string().uuid(), actorType: z.string(), actorName: z.string().nullable(), action: z.string(), entityType: z.string(), entityId: z.string().uuid().nullable(), reason: z.string().nullable(), beforeState: z.unknown().nullable(), afterState: z.unknown().nullable(), correlationId: z.string().nullable(), occurredAt: z.string() });
const auditEventsPageSchema = z.object({ data: z.array(auditEventSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const importPreviewCandidateSchema = z.object({ targetType: z.enum(['account','person','lead','opportunity']), targetId: z.string(), label: z.string(), matchedBy: z.array(z.enum(['external_id','account_name','email','phone'])) });
const importPreviewRecordSchema = z.object({ recordType: z.string(), externalId: z.string(), targetType: z.enum(['account','person','lead','opportunity']), sourceStatus: z.string().nullable(), status: z.enum(['already_linked','type_conflict','possible_match','ambiguous','no_match']), linkedTarget: z.object({ targetType: z.enum(['account','person','lead','opportunity']), targetId: z.string() }).nullable(), candidates: z.array(importPreviewCandidateSchema) });
const importsPreviewSchema = z.object({ provider: z.enum(['twenty','chatwoot','sofia_postgres']), records: z.array(importPreviewRecordSchema) });
const sessionSchema = z.object({ user: z.object({ id: z.string(), name: z.string(), email: z.string() }), activeOrganizationId: z.string().nullable(), organizations: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() })) });
const memberSchema = z.object({ id: z.string(), role: z.string(), user: z.object({ name: z.string(), email: z.string() }) });
const invitationSchema = z.object({ id: z.string(), email: z.string(), role: z.string(), organizationName: z.string().optional(), organization: z.object({ name: z.string() }).optional() }).passthrough();
export type LeadStatus = z.infer<typeof leadStatus>;
export function parseLeadStatus(value: string): LeadStatus | null { const parsed = leadStatus.safeParse(value); return parsed.success ? parsed.data : null; }
export type LeadDto = z.infer<typeof leadSchema>;
export type LeadPageDto = z.infer<typeof leadPageSchema>;
export type AccountPageDto = z.infer<typeof accountPageSchema>;
export type AccountSortBy = 'accountName' | 'contactCount' | 'leadCount' | 'respondedCount' | 'opportunityCount' | 'latestActivityAt';
export type LeadSortBy = 'accountName' | 'contactName' | 'channel' | 'source' | 'status' | 'assignedTo' | 'nextActionAt' | 'createdAt';
export type LeadAssigneeDto = z.infer<typeof leadAssigneeSchema>;
export type TaskDto = z.infer<typeof taskSchema>;
export type HandoffDto = z.infer<typeof handoffSchema>;
export type CloserEventDto = z.infer<typeof closerEventSchema>;
export type OpportunityStage = z.infer<typeof opportunityStage>;
export type OpportunityDto = z.infer<typeof opportunitySchema>;
export type OpportunityAssigneeDto = z.infer<typeof opportunityAssigneeSchema>;
export type FunnelReportDto = z.infer<typeof funnelReportSchema>;
export type OpportunityHistoryDto = z.infer<typeof opportunityHistorySchema>;
export type ActivityType = z.infer<typeof activityType>;
export type ActivityDto = z.infer<typeof activitySchema>;
export type ConversationDto = z.infer<typeof conversationSchema>;
export type ConversationPageDto = z.infer<typeof conversationPageSchema>;
export type ChannelDto = z.infer<typeof channelSchema>;
export type CreateChannelInput = { provider: ChannelDto['provider']; displayName: string; phoneNumber: string; providerChannelId: string; providerAccountId?: string };
export type MessageDto = z.infer<typeof messageSchema>;
export type AuditEventDto = z.infer<typeof auditEventSchema>;
export type AuditEventsPageDto = z.infer<typeof auditEventsPageSchema>;
export type CreateLeadInput = { accountName: string; contactName: string; email?: string; phone?: string; source?: 'manual' | 'import' | 'whatsapp' | 'referral'; duplicateOverrideReason?: string };
export type LeadDuplicateCandidateDto = z.infer<typeof leadDuplicateCandidateSchema>;
export type SessionDto = z.infer<typeof sessionSchema>;
export type TeamMemberDto = z.infer<typeof memberSchema>;
export type InvitationDto = z.infer<typeof invitationSchema>;
export class ApiError extends Error { readonly status: number; readonly code: string; constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; this.name = 'ApiError'; } }

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('x-request-id', crypto.randomUUID());
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? ''}${path}`, { ...init, headers, credentials: 'include' });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorSchema = z.object({ code: z.string().optional(), message: z.string().optional(), error: z.string().optional() }).passthrough();
    const parsedError = errorSchema.safeParse(payload);
    throw new ApiError(response.status, parsedError.success ? parsedError.data.code ?? 'REQUEST_FAILED' : 'REQUEST_FAILED', parsedError.success ? parsedError.data.message ?? parsedError.data.error ?? 'The request could not be completed.' : 'The request could not be completed.');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiError(502, 'INVALID_API_RESPONSE', 'O servidor retornou uma resposta inesperada.');
  return parsed.data;
}

function authError(result: { error?: { message?: string } | null }): { message: string } | null {
  return result.error ? { message: result.error.message ?? 'The request could not be completed.' } : null;
}

function listLeadPage(params: { status?: LeadStatus; source?: CreateLeadInput['source']; assignedToUserId?: string; search?: string; sortBy?: LeadSortBy; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.source) search.set('source', params.source);
  if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
  if (params.search) search.set('search', params.search);
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortDirection) search.set('sortDirection', params.sortDirection);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  return request(`/api/v1/leads/table?${search.toString()}`, leadPageSchema);
}

export const api = {
  session: { get: () => request('/api/v1/session', sessionSchema) },
  closerEvents: {
    list: (params: { limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/closer-events?${search.toString()}`, closerEventsPageSchema);
    },
    assignees: () => request('/api/v1/closer-events/assignees', z.array(z.object({ id: z.string().uuid(), name: z.string() }))),
    act: (eventId: string, input: { action: 'acknowledge' | 'snooze' | 'reassign' | 'resolve'; snoozedUntil?: string; assignedToUserId?: string }) => request(`/api/v1/closer-events/${encodeURIComponent(eventId)}/actions`, z.object({ id: z.string().uuid(), status: z.string(), assignedToUserId: z.string().uuid(), acknowledgedAt: z.string().nullable(), snoozedUntil: z.string().nullable(), resolvedAt: z.string().nullable() }), { method: 'PATCH', body: JSON.stringify(input) }),
  },
  inbox: {
    conversations: (params: { conversationId?: string; status?: ConversationDto['status']; channelId?: string; tagId?: string; ownerUserId?: string; search?: string; unreadOnly?: boolean; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.conversationId) search.set('conversationId', params.conversationId);
      if (params.status) search.set('status', params.status);
      if (params.channelId) search.set('channelId', params.channelId);
      if (params.tagId) search.set('tagId', params.tagId);
      if (params.ownerUserId) search.set('ownerUserId', params.ownerUserId);
      if (params.search) search.set('search', params.search);
      if (params.unreadOnly) search.set('unreadOnly', 'true');
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/conversations?${search.toString()}`, conversationPageSchema);
    },
    channels: () => request('/api/v1/conversations/channels', z.array(channelSchema)),
    tags: () => request('/api/v1/conversations/tags', z.array(conversationTagSchema)),
    assignees: () => request('/api/v1/conversations/assignees', z.array(z.object({ id: z.string().uuid(), name: z.string(), role: z.string() }))),
    messages: (conversationId: string, params: { limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages?${search.toString()}`, z.array(messageSchema));
    },
    markRead: (conversationId: string, lastInboundMessageId: string | null) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/read`, z.object({ conversationId: z.string().uuid(), lastReadAt: z.string().nullable() }), { method: 'POST', body: JSON.stringify({ lastInboundMessageId }) }),
    claim: (conversationId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/claim`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['sofia','human','paused']) }), { method: 'POST' }),
    assign: (conversationId: string, ownerUserId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/owner`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['sofia','human','paused']) }), { method: 'PATCH', body: JSON.stringify({ ownerUserId }) }),
    release: (conversationId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/release`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['sofia','human','paused']) }), { method: 'POST' }),
    setAutomationMode: (conversationId: string, mode: 'sofia' | 'paused') => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/automation`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['sofia','human','paused']) }), { method: 'POST', body: JSON.stringify(mode) }),
    sendMessage: (conversationId: string, input: { bodyText: string; idempotencyKey: string }) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, messageSchema, { method: 'POST', body: JSON.stringify(input) }),
    addNote: (conversationId: string, input: { bodyText: string; idempotencyKey: string }) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/notes`, messageSchema, { method: 'POST', body: JSON.stringify(input) }),
    addTag: (conversationId: string, name: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/tags`, conversationTagSchema, { method: 'POST', body: JSON.stringify({ name }) }),
    removeTag: (conversationId: string, tagId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/tags/${encodeURIComponent(tagId)}`, z.object({ success: z.boolean() }), { method: 'DELETE' }),
  },
  channels: {
    list: () => request('/api/v1/channels', z.array(channelSchema)),
    create: (input: CreateChannelInput) => request('/api/v1/channels', channelSchema, { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: { displayName?: string; isActive?: boolean }) => request(`/api/v1/channels/${encodeURIComponent(id)}`, channelSchema, { method: 'PATCH', body: JSON.stringify(input) }),
    setCredentials: (id: string, input: { provider: 'evolution'; baseUrl: string; apiKey: string; webhookSecret: string } | { provider: 'whatsapp_cloud_api'; accessToken: string }) => request(`/api/v1/channels/${encodeURIComponent(id)}/credentials`, channelSchema, { method: 'PUT', body: JSON.stringify(input) }),
  },
  audit: {
    list: (params: { action?: string; entityType?: string; from?: string; to?: string; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.action) search.set('action', params.action);
      if (params.entityType) search.set('entityType', params.entityType);
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/audit-events?${search.toString()}`, auditEventsPageSchema);
    },
  },
  imports: {
    preview: (input: { provider: 'twenty' | 'chatwoot' | 'sofia_postgres'; records: Array<{ recordType: string; externalId: string; targetType: 'account' | 'person' | 'lead' | 'opportunity'; accountName?: string; contactName?: string; email?: string; phone?: string; sourceStatus?: string }> }) => request('/api/v1/imports/reconciliation-preview', importsPreviewSchema, { method: 'POST', body: JSON.stringify(input) }),
  },

  leads: {
    listPage: listLeadPage,
    checkDuplicates: (input: Pick<CreateLeadInput, 'accountName' | 'email' | 'phone'>) => request('/api/v1/leads/duplicate-check', leadDuplicateCheckSchema, { method: 'POST', body: JSON.stringify({ accountName: input.accountName, email: input.email, phone: input.phone }) }),
    assignees: () => request('/api/v1/leads/assignees', z.array(leadAssigneeSchema)),
    assign: (id: string, assignedToUserId: string | null) => request(`/api/v1/leads/${encodeURIComponent(id)}/assignee`, leadSchema, { method: 'PATCH', body: JSON.stringify({ assignedToUserId }) }),
    list: (params: { status?: LeadStatus; assignedToUserId?: string; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.status) search.set('status', params.status);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/leads?${search.toString()}`, z.array(leadSchema));
    },
    create: (input: CreateLeadInput) => request('/api/v1/leads', leadSchema, { method: 'POST', body: JSON.stringify(input) }),
    updateStatus: (id: string, status: LeadStatus, reason: string) => request(`/api/v1/leads/${encodeURIComponent(id)}/status`, leadSchema, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
  },
  accounts: {
    listPage: (params: { search?: string; leadStatus?: LeadStatus; sortBy?: AccountSortBy; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.search) search.set('search', params.search);
      if (params.leadStatus) search.set('leadStatus', params.leadStatus);
      if (params.sortBy) search.set('sortBy', params.sortBy);
      if (params.sortDirection) search.set('sortDirection', params.sortDirection);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/accounts/table?${search.toString()}`, accountPageSchema);
    },
  },
  tasks: {
    list: (params: { from?: string; to?: string; assignedToUserId?: string; status?: TaskDto['status']; limit?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.status) search.set('status', params.status);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      return request(`/api/v1/leads/tasks?${search.toString()}`, z.array(taskSchema));
    },
    create: (leadId: string, input: { title: string; dueAt: string }) => request(`/api/v1/leads/${encodeURIComponent(leadId)}/tasks`, taskSchema, { method: 'POST', body: JSON.stringify(input) }),
    complete: (id: string, input: { result: z.infer<typeof taskResult>; resultNote?: string; followUp?: { title: string; dueAt: string } }) => request(`/api/v1/leads/tasks/${encodeURIComponent(id)}/complete`, taskSchema, { method: 'PATCH', body: JSON.stringify(input) }),
  },
  handoffs: {
    list: (status: HandoffDto['status'] = 'requested', params: { limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams({ status, limit: String(params.limit ?? 100) });
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/handoffs?${search.toString()}`, z.array(handoffSchema));
    },
    create: (input: { leadId: string; reason: string; evidence: string; confirmedFacts: string[]; unknowns: string[]; nextStep: string; nextStepAt: string }) => request('/api/v1/handoffs', handoffSchema, { method: 'POST', body: JSON.stringify(input) }),
    accept: (id: string) => request(`/api/v1/handoffs/${encodeURIComponent(id)}/accept`, handoffSchema, { method: 'PATCH' }),
    returnToSdr: (id: string, input: { reason: string; nextStep: string; dueAt: string }) => request(`/api/v1/handoffs/${encodeURIComponent(id)}/return`, handoffSchema, { method: 'PATCH', body: JSON.stringify(input) }),
  },
  opportunities: {
    assignees: () => request('/api/v1/opportunities/assignees', z.array(opportunityAssigneeSchema)),
    assignOwner: (id: string, ownerUserId: string | null) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/owner`, opportunitySchema, { method: 'PATCH', body: JSON.stringify({ ownerUserId }) }),
    list: (params: { view?: 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'; stage?: OpportunityStage; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.view) search.set('view', params.view);
      if (params.stage) search.set('stage', params.stage);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/opportunities?${search.toString()}`, z.array(opportunitySchema));
    },
    transition: (id: string, input: { expectedStage: OpportunityStage; stage: OpportunityStage; reason?: string; nextAction?: string; nextActionAt?: string; amount?: string; currency?: string; closedAt?: string; lossReason?: string }) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/stage`, opportunitySchema, { method: 'PATCH', body: JSON.stringify(input) }),
    history: (id: string) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/history`, z.array(opportunityHistorySchema)),
    activities: {
      list: (id: string) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/activities`, z.array(activitySchema)),
      create: (id: string, input: { type: ActivityType; subject: string; details?: string; result?: string; occurredAt: string }) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/activities`, activitySchema, { method: 'POST', body: JSON.stringify(input) }),
    },
  },
  reports: {
    funnel: (from: string, to: string) => request(`/api/v1/reports/funnel?${new URLSearchParams({ from, to })}`, funnelReportSchema),
  },
  team: {
    async listMembers(organizationId: string): Promise<{ data: TeamMemberDto[] | null; error: { message: string } | null }> {
      const result = await authClient.organization.listMembers({ query: { organizationId, limit: 100 } });
      const error = authError(result);
      if (error || !result.data) return { data: null, error: error ?? { message: 'The team could not be loaded.' } };
      const parsed = z.object({ members: z.array(memberSchema) }).safeParse(result.data);
      return parsed.success ? { data: parsed.data.members, error: null } : { data: null, error: { message: 'The member response is invalid.' } };
    },
    async invite(input: { organizationId: string; email: string; role: OrganizationRole }): Promise<{ error: { message: string } | null }> {
      const result = await authClient.organization.inviteMember({ ...input, resend: true });
      return { error: authError(result) };
    },
  },
  auth: {
    setActiveOrganization: (organizationId: string) => authClient.organization.setActive({ organizationId }),
    signInEmail: (input: { email: string; password: string; callbackURL?: string }) => authClient.signIn.email(input),
    signUpEmail: (input: { name: string; email: string; password: string; callbackURL?: string }) => authClient.signUp.email(input),
    getSession: () => authClient.getSession(),
    async getInvitation(id: string): Promise<{ data: InvitationDto | null; error: { message: string } | null }> {
      const result = await authClient.organization.getInvitation({ query: { id } });
      const error = authError(result);
      if (error || !result.data) return { data: null, error: error ?? { message: 'Invitation is unavailable.' } };
      const parsed = invitationSchema.safeParse(result.data);
      return parsed.success ? { data: parsed.data, error: null } : { data: null, error: { message: 'Invitation response is invalid.' } };
    },
    acceptInvitation: (invitationId: string) => authClient.organization.acceptInvitation({ invitationId }),
  },
};
