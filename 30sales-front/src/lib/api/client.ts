import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { z } from 'zod';
import { access, roles, type OrganizationRole } from '../permissions';
import { PLATFORM_ORGANIZATION_API_PATH, PLATFORM_ROLE_NAMES } from '../authorizationConstants';
import { ACCOUNT_MARKET_SEGMENTS } from '../accountConstants';

const authClient = createAuthClient({ baseURL: import.meta.env.VITE_API_URL ?? '', plugins: [organizationClient({ ac: access, roles })] });
export const ACCOUNT_SEGMENT_FILTER = { unassigned: 'unassigned' } as const;
export const ACCOUNT_SEGMENT_ERROR_CODE = { alreadyExists: 'ACCOUNT_SEGMENT_ALREADY_EXISTS' } as const;
export const INBOX_MEDIA_ERROR_CODE = { tooLarge: 'MEDIA_SIZE_LIMIT_EXCEEDED', unsupportedType: 'MEDIA_TYPE_UNSUPPORTED', invalidContent: 'MEDIA_CONTENT_INVALID', missing: 'MEDIA_FILE_REQUIRED', audioCaptionUnsupported: 'MEDIA_AUDIO_CAPTION_UNSUPPORTED' } as const;
const leadStatus = z.enum(['new','researching','ready','queued','contacting','responded','converted_to_sdr','invalid_contact','no_channel','out_of_profile','duplicate_review','no_response','paused','do_not_contact']);
export const ASSISTANT_RUN_OPERATION = { replyGeneration: 'reply_generation', audioTranscription: 'audio_transcription' } as const;
export const ASSISTANT_RUN_STATUS = { started: 'started', completed: 'completed', failed: 'failed' } as const;
const assistantRunOperation = z.enum([ASSISTANT_RUN_OPERATION.replyGeneration, ASSISTANT_RUN_OPERATION.audioTranscription]);
const assistantRunStatus = z.enum([ASSISTANT_RUN_STATUS.started, ASSISTANT_RUN_STATUS.completed, ASSISTANT_RUN_STATUS.failed]);
const accountMarketSegment = z.enum(ACCOUNT_MARKET_SEGMENTS);
const leadSchema = z.object({ id: z.string().uuid(), accountId: z.string().uuid(), accountName: z.string(), accountSegmentId: z.string().uuid().nullable(), accountSegmentName: z.string().nullable(), accountMarketSegment: accountMarketSegment.nullable(), accountStudentCount: z.number().int().nonnegative().nullable(), contactName: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), source: z.string(), status: leadStatus, nextActionAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(), assignedToUserId: z.string().uuid().nullable(), assignedToName: z.string().nullable() });
const leadContactSchema = z.object({ id: z.string().uuid(), name: z.string(), email: z.string().nullable(), phone: z.string().nullable(), jobTitle: z.string().nullable(), isPrimary: z.boolean(), isInterested: z.boolean(), hasConversation: z.boolean(), referralNote: z.string().nullable(), notes: z.string().nullable() });
const createLeadContactSchema = z.object({ name: z.string().trim().min(2).max(160), email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(), phone: z.string().trim().max(40).optional(), jobTitle: z.string().trim().max(120).optional(), isInterested: z.boolean(), referralNote: z.string().trim().max(500).optional(), notes: z.string().trim().max(2000).optional() });
const leadDuplicateCandidateSchema = z.object({ id: z.string().uuid(), accountName: z.string(), contactName: z.string().nullable(), status: leadStatus, source: z.string(), matchedBy: z.array(z.enum(['account_name', 'email', 'phone'])) });
const leadDuplicateCheckSchema = z.object({ candidates: z.array(leadDuplicateCandidateSchema) });
const leadAssigneeSchema = z.object({ id: z.string().uuid(), name: z.string(), role: z.string() });
const leadPageSchema = z.object({ data: z.array(leadSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const accountProfileSchema = z.object({ marketSegment: accountMarketSegment.nullable(), studentCount: z.number().int().nonnegative().nullable() });
const accountPageSchema = z.object({ data: z.array(z.object({ id: z.string().uuid(), name: z.string(), segmentId: z.string().uuid().nullable(), segmentName: z.string().nullable(), marketSegment: accountMarketSegment.nullable(), studentCount: z.number().int().nonnegative().nullable(), contactCount: z.number(), leadCount: z.number(), respondedCount: z.number(), opportunityCount: z.number(), latestActivityAt: z.string().nullable() })), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const accountSegmentSchema = z.object({ id: z.string().uuid(), name: z.string() });
const taskResult = z.enum(['completed', 'contacted', 'no_response', 'follow_up']);
const taskSchema = z.object({ id: z.string().uuid(), leadId: z.string().uuid(), title: z.string(), dueAt: z.string(), status: z.enum(['open', 'completed', 'cancelled']), completedAt: z.string().nullable(), accountName: z.string(), contactName: z.string().nullable(), completionResult: taskResult.nullable(), completionNote: z.string().nullable() });
const taskPageSchema = z.object({ data: z.array(taskSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const handoffSchema = z.object({ id: z.string().uuid(), opportunityId: z.string().uuid(), conversationId: z.string().uuid().nullable(), leadId: z.string().uuid(), opportunityName: z.string(), accountName: z.string(), contactName: z.string(), status: z.enum(['requested', 'accepted', 'returned']), reason: z.string(), evidence: z.string(), confirmedFacts: z.array(z.string()), unknowns: z.array(z.string()), nextStep: z.string(), nextStepAt: z.string(), requestedByName: z.string(), closerName: z.string().nullable(), returnReason: z.string().nullable(), requestedAt: z.string(), acceptedAt: z.string().nullable(), firstActivityAt: z.string().nullable() });
const handoffPageSchema = z.object({ data: z.array(handoffSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const closerEventSchema = z.object({ id: z.string().uuid(), eventType: z.string(), priority: z.string(), status: z.string(), conversationId: z.string().uuid(), opportunityId: z.string().uuid(), assignedToUserId: z.string().uuid(), accountName: z.string(), contactName: z.string(), summary: z.string(), evidence: z.string().nullable(), occurredAt: z.string(), dueAt: z.string().nullable(), acknowledgedAt: z.string().nullable(), snoozedUntil: z.string().nullable() });
const closerEventsPageSchema = z.object({ data: z.array(closerEventSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const closerEventSlaSettingsSchema = z.object({ policies: z.array(z.object({ eventType: z.enum(['qualified_handoff', 'human_requested', 'buying_intent', 'closer_question', 'lead_replied_after_handoff', 'interpretation_failure']), targetMinutes: z.number().int().nullable(), escalateToManagers: z.boolean() })), canManage: z.boolean() });
const closerSlaNotificationSchema = z.object({ id: z.string().uuid(), closerEventId: z.string().uuid(), conversationId: z.string().uuid(), notificationType: z.enum(['closer_event_sla_overdue', 'closer_event_sla_escalated']), eventType: z.string(), summary: z.string(), accountName: z.string().nullable(), dueAt: z.string(), createdAt: z.string() });
const userNotificationSchema = z.object({ id: z.string().uuid(), notificationType: z.enum(['closer_event_sla_overdue', 'closer_event_sla_escalated', 'inbox_new_message', 'task_overdue', 'handoff_accepted', 'handoff_returned', 'conversation_assigned', 'opportunity_assigned']), conversationId: z.string().uuid().nullable(), taskId: z.string().uuid().nullable(), handoffId: z.string().uuid().nullable(), opportunityId: z.string().uuid().nullable(), taskTitle: z.string().nullable(), eventType: z.string().nullable(), summary: z.string(), accountName: z.string().nullable(), contactName: z.string().nullable(), dueAt: z.string().nullable(), createdAt: z.string() });
const userNotificationsPageSchema = z.object({ data: z.array(userNotificationSchema), unreadCount: z.number().int().nonnegative() });
const opportunityStage = z.enum(['qualification','closer_contact_pending','discovery_scheduled','discovery_done','solution_confirmed','proposal_preparing','proposal_sent','negotiation','won','lost','custom']);
const opportunitySchema = z.object({ id: z.string().uuid(), leadId: z.string().uuid(), name: z.string(), accountName: z.string(), contactName: z.string(), contactEmail: z.string().nullable(), contactPhone: z.string().nullable(), pipelineId: z.string().uuid(), stage: opportunityStage, pipelineStageKey: z.string().nullable(), pipelineStageName: z.string().nullable(), stageChangedAt: z.string(), ownerUserId: z.string().uuid().nullable(), ownerName: z.string().nullable(), canUpdate: z.boolean(), amount: z.string().nullable(), currency: z.string().nullable(), closedAt: z.string().nullable(), lossReason: z.string().nullable(), nextAction: z.string().nullable(), nextActionAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() });
const pipelineStageSchema = z.object({ key: z.string(), stage: opportunityStage, name: z.string().nullable(), isSystem: z.boolean(), isActive: z.boolean(), position: z.number() });
const pipelineStagesSchema = z.object({ pipelineId: z.string().uuid(), stages: z.array(pipelineStageSchema), canManage: z.boolean() });
const pipelinesSchema = z.object({ pipelines: z.array(z.object({ id: z.string().uuid(), name: z.string(), isDefault: z.boolean(), isActive: z.boolean() })), defaultPipelineId: z.string().uuid(), canManage: z.boolean() });
const opportunityPageSchema = z.object({ data: z.array(opportunitySchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const opportunityAssigneeSchema = z.object({ id: z.string().uuid(), name: z.string() });
const funnelReportSchema = z.object({ from: z.string(), to: z.string(), currentOpenCount: z.number(), openWithoutNextActionCount: z.number(), overdueNextActionCount: z.number(), currentStages: z.array(z.object({ stage: opportunityStage, pipelineStageKey: z.string().nullable(), count: z.number() })), createdInPeriodCount: z.number(), wonInPeriodCount: z.number(), lostInPeriodCount: z.number(), wonAmountByCurrency: z.array(z.object({ currency: z.string(), amount: z.string() })), acceptedHandoffsInPeriodCount: z.number(), firstActivityCount: z.number(), pendingFirstActivityCount: z.number(), averageMinutesToFirstActivity: z.number().nullable(), leadCountsByStatus: z.array(z.object({ status: leadStatus, count: z.number() })), leadsCreatedInPeriodCount: z.number(), salesTrend: z.array(z.object({ date: z.string(), leadsCreated: z.number(), opportunitiesCreated: z.number(), won: z.number(), lost: z.number() })), leadCohorts: z.array(z.object({ date: z.string(), ageDays: z.number(), leadCount: z.number(), respondedCount: z.number(), convertedToSdrCount: z.number(), opportunityCount: z.number(), respondedRate: z.number(), convertedToSdrRate: z.number(), opportunityRate: z.number() })), generatedAt: z.string() });
const aiUsageReportSchema = z.object({ from: z.string(), to: z.string(), points: z.array(z.object({ date: z.string(), operation: assistantRunOperation, status: assistantRunStatus, runCount: z.number(), averageLatencyMs: z.number().nullable(), estimatedCostUsd: z.string().nullable(), audioDurationMs: z.number(), inputTokens: z.number(), outputTokens: z.number() })), generatedAt: z.string() });
const opportunityHistorySchema = z.object({ id: z.string().uuid(), fromStage: opportunityStage.nullable(), fromPipelineStageKey: z.string().nullable(), fromPipelineStageName: z.string().nullable(), toStage: opportunityStage, toPipelineStageKey: z.string().nullable(), toPipelineStageName: z.string().nullable(), actorName: z.string(), reason: z.string().nullable(), occurredAt: z.string() });
const activityType = z.enum(['call','meeting','email','message','task','note','research']);
const activitySchema = z.object({ id: z.string().uuid(), type: activityType, subject: z.string(), details: z.string().nullable(), result: z.string().nullable(), occurredAt: z.string(), actorName: z.string(), createdAt: z.string() });
const conversationStatus = z.enum(['open','pending','resolved','snoozed']);
const channelProvider = z.enum(['evolution','whatsapp_cloud_api']);
const channelSchema = z.object({ id: z.string().uuid(), provider: channelProvider, displayName: z.string(), phoneNumber: z.string(), providerChannelId: z.string(), providerAccountId: z.string().nullable(), isActive: z.boolean(), isConfigured: z.boolean(), createdAt: z.string(), updatedAt: z.string() });
const channelHealthCheckSchema = z.object({ status: z.enum(['not_configured', 'connected', 'connecting', 'disconnected', 'reachable', 'credentials_invalid', 'configuration_error', 'unavailable', 'unknown']), checkedAt: z.string() });
const assistantSettingsSchema = z.object({ enabled: z.boolean(), model: z.string(), transcribeAudio: z.boolean(), availableModels: z.array(z.object({ id: z.string(), name: z.string(), provider: z.string() })), systemPrompt: z.string(), updatedAt: z.string().nullable(), runtimeAvailable: z.boolean(), transcriptionAvailable: z.boolean() });
const conversationTagSchema = z.object({ id: z.string().uuid(), name: z.string() });
const conversationSchema = z.object({ id: z.string().uuid(), provider: z.string(), status: conversationStatus, accountName: z.string().nullable(), personName: z.string().nullable(), personEmail: z.string().nullable(), personPhone: z.string().nullable(), lead: z.object({ status: z.string(), source: z.string(), nextActionAt: z.string().nullable() }).nullable(), lastMessageAt: z.string().nullable(), createdAt: z.string(), channelId: z.string().uuid().nullable(), channelName: z.string().nullable(), channelPhoneNumber: z.string().nullable(), channelProvider: channelProvider.nullable(), ownerUserId: z.string().uuid().nullable(), ownerName: z.string().nullable(), automationMode: z.enum(['assistant','human','paused']), replyAvailable: z.boolean(), unread: z.boolean(), tags: z.array(conversationTagSchema), assistantQualification: z.object({ intent: z.string(), summary: z.string(), confirmedFacts: z.array(z.string()), unknowns: z.array(z.string()), nextStep: z.string(), updatedAt: z.string() }).nullable() });
const conversationPageSchema = z.object({ data: z.array(conversationSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const attachmentSchema = z.object({ id: z.string().uuid(), mediaType: z.enum(['image','video','audio','document','sticker']), mimeType: z.string().nullable(), fileName: z.string().nullable(), sizeBytes: z.number().int().nullable(), status: z.enum(['pending','processing','available','failed']) });
const messageSchema = z.object({ id: z.string().uuid(), direction: z.enum(['inbound','outbound','internal']), actorType: z.enum(['contact','user','assistant','system']), bodyText: z.string().nullable(), transcriptText: z.string().nullable(), deliveryState: z.enum(['received','requested','accepted','delivered','read','failed','unknown']), occurredAt: z.string(), actorUserId: z.string().uuid().nullable().optional(), actorName: z.string().nullable().optional(), attachments: z.array(attachmentSchema) });
const auditEventSchema = z.object({ id: z.string().uuid(), actorType: z.string(), actorName: z.string().nullable(), action: z.string(), entityType: z.string(), entityId: z.string().uuid().nullable(), reason: z.string().nullable(), beforeState: z.unknown().nullable(), afterState: z.unknown().nullable(), correlationId: z.string().nullable(), occurredAt: z.string() });
const auditEventsPageSchema = z.object({ data: z.array(auditEventSchema), pagination: z.object({ limit: z.number(), offset: z.number(), total: z.number(), hasNextPage: z.boolean() }) });
const importPreviewCandidateSchema = z.object({ targetType: z.enum(['account','person','lead','opportunity']), targetId: z.string(), label: z.string(), matchedBy: z.array(z.enum(['external_id','account_name','email','phone'])) });
const importPreviewRecordSchema = z.object({ recordType: z.string(), externalId: z.string(), targetType: z.enum(['account','person','lead','opportunity']), sourceStatus: z.string().nullable(), status: z.enum(['already_linked','type_conflict','possible_match','ambiguous','no_match']), linkedTarget: z.object({ targetType: z.enum(['account','person','lead','opportunity']), targetId: z.string() }).nullable(), candidates: z.array(importPreviewCandidateSchema) });
const importsPreviewSchema = z.object({ provider: z.enum(['twenty','chatwoot','legacy_postgres']), records: z.array(importPreviewRecordSchema) });
const sessionSchema = z.object({ user: z.object({ id: z.string(), name: z.string(), email: z.string(), platformRole: z.enum(PLATFORM_ROLE_NAMES) }), activeOrganizationId: z.string().nullable(), activeOrganizationRole: z.string().nullable(), organizations: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() })) });
const platformOrganizationSchema = z.object({ id: z.string().uuid(), name: z.string(), slug: z.string(), memberCount: z.number().int().nonnegative(), createdAt: z.string() });
const platformOrganizationPageSchema = z.object({ data: z.array(platformOrganizationSchema), pagination: z.object({ limit: z.number().int(), offset: z.number().int(), total: z.number().int(), hasNextPage: z.boolean() }) });
const platformOrganizationCreateSchema = z.object({ organization: platformOrganizationSchema, ownerInvitation: z.object({ email: z.string().email(), invitationUrl: z.string().url(), emailSent: z.boolean() }) });
const memberSchema = z.object({ id: z.string(), role: z.string(), user: z.object({ name: z.string(), email: z.string() }) });
const invitationSchema = z.object({ id: z.string(), email: z.string(), role: z.string(), organizationName: z.string().optional(), organization: z.object({ name: z.string() }).optional() }).passthrough();
export type LeadStatus = z.infer<typeof leadStatus>;
export function parseLeadStatus(value: string): LeadStatus | null { const parsed = leadStatus.safeParse(value); return parsed.success ? parsed.data : null; }
export type LeadDto = z.infer<typeof leadSchema>;
export type LeadContactDto = z.infer<typeof leadContactSchema>;
export type CreateLeadContactInput = z.infer<typeof createLeadContactSchema>;
export type LeadPageDto = z.infer<typeof leadPageSchema>;
export type AccountPageDto = z.infer<typeof accountPageSchema>;
export type AccountSortBy = 'accountName' | 'segment' | 'contactCount' | 'leadCount' | 'respondedCount' | 'opportunityCount' | 'latestActivityAt';
export type AccountMarketSegment = z.infer<typeof accountMarketSegment>;
export type LeadSortBy = 'accountName' | 'contactName' | 'channel' | 'source' | 'status' | 'segment' | 'assignedTo' | 'nextActionAt' | 'createdAt';
export type AccountSegmentDto = z.infer<typeof accountSegmentSchema>;
export type LeadAssigneeDto = z.infer<typeof leadAssigneeSchema>;
export type TaskDto = z.infer<typeof taskSchema>;
export type HandoffDto = z.infer<typeof handoffSchema>;
export type CloserEventDto = z.infer<typeof closerEventSchema>;
export type CloserEventSlaSettingsDto = z.infer<typeof closerEventSlaSettingsSchema>;
export type CloserSlaNotificationDto = z.infer<typeof closerSlaNotificationSchema>;
export type UserNotificationDto = z.infer<typeof userNotificationSchema>;
export type OpportunityStage = z.infer<typeof opportunityStage>;
export type PipelineStageDto = z.infer<typeof pipelineStageSchema>;
export type PipelineStagesDto = z.infer<typeof pipelineStagesSchema>;
export type PipelinesDto = z.infer<typeof pipelinesSchema>;
export type OpportunityDto = z.infer<typeof opportunitySchema>;
export type OpportunityAssigneeDto = z.infer<typeof opportunityAssigneeSchema>;
export type FunnelReportDto = z.infer<typeof funnelReportSchema>;
export type AiUsageReportDto = z.infer<typeof aiUsageReportSchema>;
export type OpportunityHistoryDto = z.infer<typeof opportunityHistorySchema>;
export type ActivityType = z.infer<typeof activityType>;
export type ActivityDto = z.infer<typeof activitySchema>;
export type ConversationDto = z.infer<typeof conversationSchema>;
export type ConversationPageDto = z.infer<typeof conversationPageSchema>;
export type ChannelDto = z.infer<typeof channelSchema>;
export type ChannelHealthCheckDto = z.infer<typeof channelHealthCheckSchema>;
export type AssistantSettingsDto = z.infer<typeof assistantSettingsSchema>;
export type CreateChannelInput = { provider: ChannelDto['provider']; displayName: string; phoneNumber: string; providerChannelId: string; providerAccountId?: string };
export type MessageDto = z.infer<typeof messageSchema>;
export type MessageAttachmentDto = z.infer<typeof attachmentSchema>;
export type AuditEventDto = z.infer<typeof auditEventSchema>;
export type AuditEventsPageDto = z.infer<typeof auditEventsPageSchema>;
export type CreateLeadInput = { accountName: string; contactName?: string; email?: string; phone?: string; source?: 'manual' | 'import' | 'whatsapp' | 'referral'; duplicateOverrideReason?: string };
export type LeadDuplicateCandidateDto = z.infer<typeof leadDuplicateCandidateSchema>;
export type SessionDto = z.infer<typeof sessionSchema>;
export type PlatformOrganizationDto = z.infer<typeof platformOrganizationSchema>;
export type CreatePlatformOrganizationInput = { name: string; slug: string; ownerEmail: string };
export type TeamMemberDto = z.infer<typeof memberSchema>;
export type InvitationDto = z.infer<typeof invitationSchema>;
export class ApiError extends Error { readonly status: number; readonly code: string; constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; this.name = 'ApiError'; } }

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('x-request-id', crypto.randomUUID());
  if (init.body && !(typeof FormData !== 'undefined' && init.body instanceof FormData)) headers.set('content-type', 'application/json');
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

async function requestBlob(path: string): Promise<Blob> {
  const headers = new Headers({ accept: 'application/octet-stream', 'x-request-id': crypto.randomUUID() });
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? ''}${path}`, { headers, credentials: 'include' });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    const errorSchema = z.object({ code: z.string().optional(), message: z.string().optional(), error: z.string().optional() }).passthrough();
    const parsedError = errorSchema.safeParse(payload);
    throw new ApiError(response.status, parsedError.success ? parsedError.data.code ?? 'REQUEST_FAILED' : 'REQUEST_FAILED', parsedError.success ? parsedError.data.message ?? parsedError.data.error ?? 'The request could not be completed.' : 'The request could not be completed.');
  }
  return response.blob();
}

function authError(result: { error?: { message?: string } | null }): { message: string } | null {
  return result.error ? { message: result.error.message ?? 'The request could not be completed.' } : null;
}

function listLeadPage(params: { status?: LeadStatus; source?: CreateLeadInput['source']; assignedToUserId?: string; segmentId?: string; marketSegment?: AccountMarketSegment; withoutMarketSegment?: boolean; studentCountMin?: number; studentCountMax?: number; search?: string; sortBy?: LeadSortBy; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.source) search.set('source', params.source);
  if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
  if (params.segmentId) search.set('segmentId', params.segmentId);
  if (params.marketSegment) search.set('marketSegment', params.marketSegment);
  if (params.withoutMarketSegment) search.set('withoutMarketSegment', String(params.withoutMarketSegment));
  if (params.studentCountMin !== undefined) search.set('studentCountMin', String(params.studentCountMin));
  if (params.studentCountMax !== undefined) search.set('studentCountMax', String(params.studentCountMax));
  if (params.search) search.set('search', params.search);
  if (params.sortBy) search.set('sortBy', params.sortBy);
  if (params.sortDirection) search.set('sortDirection', params.sortDirection);
  if (params.limit !== undefined) search.set('limit', String(params.limit));
  if (params.offset !== undefined) search.set('offset', String(params.offset));
  return request(`/api/v1/leads/table?${search.toString()}`, leadPageSchema);
}

export const api = {
  session: { get: () => request('/api/v1/session', sessionSchema) },
  notifications: {
    list: (limit = 20) => request(`/api/v1/notifications?limit=${limit}`, userNotificationsPageSchema),
    markRead: (notificationId: string) => request(`/api/v1/notifications/${encodeURIComponent(notificationId)}/read`, z.object({ id: z.string().uuid(), read: z.literal(true) }), { method: 'PATCH' }),
    markAllRead: () => request('/api/v1/notifications/read-all', z.object({ read: z.literal(true) }), { method: 'POST' }),
  },
  closerEvents: {
    list: (params: { limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/closer-events?${search.toString()}`, closerEventsPageSchema);
    },
    assignees: () => request('/api/v1/closer-events/assignees', z.array(z.object({ id: z.string().uuid(), name: z.string() }))),
    slaSettings: () => request('/api/v1/closer-events/sla-policies', closerEventSlaSettingsSchema),
    saveSlaSettings: (input: { policies: CloserEventSlaSettingsDto['policies'] }) => request('/api/v1/closer-events/sla-policies', closerEventSlaSettingsSchema, { method: 'PUT', body: JSON.stringify(input) }),
    slaNotifications: (limit = 20) => request(`/api/v1/closer-events/sla-notifications?limit=${limit}`, z.array(closerSlaNotificationSchema)),
    readSlaNotification: (notificationId: string) => request(`/api/v1/closer-events/sla-notifications/${encodeURIComponent(notificationId)}/read`, z.object({ id: z.string().uuid(), read: z.literal(true) }), { method: 'PATCH' }),
    act: (eventId: string, input: { action: 'acknowledge' | 'snooze' | 'reassign' | 'resolve'; snoozedUntil?: string; assignedToUserId?: string }) => request(`/api/v1/closer-events/${encodeURIComponent(eventId)}/actions`, z.object({ id: z.string().uuid(), status: z.string(), assignedToUserId: z.string().uuid(), acknowledgedAt: z.string().nullable(), snoozedUntil: z.string().nullable(), resolvedAt: z.string().nullable() }), { method: 'PATCH', body: JSON.stringify(input) }),
  },
  inbox: {
    subscribe: () => new EventSource(`${import.meta.env.VITE_API_URL ?? ''}/api/v1/conversations/events`, { withCredentials: true }),
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
    downloadAttachment: (attachmentId: string) => requestBlob(`/api/v1/attachments/${encodeURIComponent(attachmentId)}/content`),
    markRead: (conversationId: string, lastInboundMessageId: string | null) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/read`, z.object({ conversationId: z.string().uuid(), lastReadAt: z.string().nullable() }), { method: 'POST', body: JSON.stringify({ lastInboundMessageId }) }),
    claim: (conversationId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/claim`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['assistant','human','paused']) }), { method: 'POST' }),
    assign: (conversationId: string, ownerUserId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/owner`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['assistant','human','paused']) }), { method: 'PATCH', body: JSON.stringify({ ownerUserId }) }),
    release: (conversationId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/release`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['assistant','human','paused']) }), { method: 'POST' }),
    setAutomationMode: (conversationId: string, mode: 'assistant' | 'paused') => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/automation`, z.object({ id: z.string().uuid(), ownerUserId: z.string().uuid().nullable(), automationMode: z.enum(['assistant','human','paused']) }), { method: 'POST', body: JSON.stringify(mode) }),
    setStatus: (conversationId: string, status: 'open' | 'resolved') => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/status`, z.object({ id: z.string().uuid(), status: z.enum(['open','resolved']) }), { method: 'PATCH', body: JSON.stringify({ status }) }),
    sendMessage: (conversationId: string, input: { bodyText: string; idempotencyKey: string }) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, messageSchema, { method: 'POST', body: JSON.stringify(input) }),
    sendMediaMessage: (conversationId: string, input: { bodyText: string; idempotencyKey: string; file: File }) => {
      const form = new FormData();
      form.set('file', input.file, input.file.name);
      form.set('bodyText', input.bodyText);
      form.set('idempotencyKey', input.idempotencyKey);
      return request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages/media`, messageSchema, { method: 'POST', body: form });
    },
    addNote: (conversationId: string, input: { bodyText: string; idempotencyKey: string }) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/notes`, messageSchema, { method: 'POST', body: JSON.stringify(input) }),
    addTag: (conversationId: string, name: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/tags`, conversationTagSchema, { method: 'POST', body: JSON.stringify({ name }) }),
    removeTag: (conversationId: string, tagId: string) => request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/tags/${encodeURIComponent(tagId)}`, z.object({ success: z.boolean() }), { method: 'DELETE' }),
  },
  agents: {
    getAssistantSettings: () => request('/api/v1/agents/assistant', assistantSettingsSchema),
    saveAssistantSettings: (input: { enabled: boolean; model: string; transcribeAudio: boolean; systemPrompt: string }) => request('/api/v1/agents/assistant', assistantSettingsSchema, { method: 'PUT', body: JSON.stringify(input) }),
  },
  channels: {
    list: () => request('/api/v1/channels', z.array(channelSchema)),
    create: (input: CreateChannelInput) => request('/api/v1/channels', channelSchema, { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: { displayName?: string; isActive?: boolean }) => request(`/api/v1/channels/${encodeURIComponent(id)}`, channelSchema, { method: 'PATCH', body: JSON.stringify(input) }),
    setCredentials: (id: string, input: { provider: 'evolution'; baseUrl: string; apiKey: string; webhookSecret: string } | { provider: 'whatsapp_cloud_api'; accessToken: string; signalSecret: string }) => request(`/api/v1/channels/${encodeURIComponent(id)}/credentials`, channelSchema, { method: 'PUT', body: JSON.stringify(input) }),
    healthCheck: (id: string) => request(`/api/v1/channels/${encodeURIComponent(id)}/health-check`, channelHealthCheckSchema, { method: 'POST' }),
  },
  audit: {
    list: (params: { action?: string; entityType?: string; from?: string; to?: string; sortBy?: 'occurredAt' | 'action' | 'actorName' | 'entityType' | 'reason'; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.action) search.set('action', params.action);
      if (params.entityType) search.set('entityType', params.entityType);
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.sortBy) search.set('sortBy', params.sortBy);
      if (params.sortDirection) search.set('sortDirection', params.sortDirection);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/audit-events?${search.toString()}`, auditEventsPageSchema);
    },
  },
  imports: {
    preview: (input: { provider: 'twenty' | 'chatwoot' | 'legacy_postgres'; records: Array<{ recordType: string; externalId: string; targetType: 'account' | 'person' | 'lead' | 'opportunity'; accountName?: string; contactName?: string; email?: string; phone?: string; sourceStatus?: string }> }) => request('/api/v1/imports/reconciliation-preview', importsPreviewSchema, { method: 'POST', body: JSON.stringify(input) }),
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
    contacts: (id: string) => request(`/api/v1/leads/${encodeURIComponent(id)}/contacts`, z.array(leadContactSchema)),
    addContact: (id: string, input: CreateLeadContactInput) => request(`/api/v1/leads/${encodeURIComponent(id)}/contacts`, leadContactSchema, { method: 'POST', body: JSON.stringify(input) }),
    updateContact: (leadId: string, contactId: string, isInterested: boolean) => request(`/api/v1/leads/${encodeURIComponent(leadId)}/contacts/${encodeURIComponent(contactId)}`, leadContactSchema, { method: 'PATCH', body: JSON.stringify({ isInterested }) }),
    setPrimaryContact: (leadId: string, contactId: string) => request(`/api/v1/leads/${encodeURIComponent(leadId)}/contacts/${encodeURIComponent(contactId)}/primary`, leadContactSchema, { method: 'PATCH' }),
  },
  accounts: {
    segments: () => request('/api/v1/accounts/segments', z.array(accountSegmentSchema)),
    createSegment: (name: string) => request('/api/v1/accounts/segments', accountSegmentSchema, { method: 'POST', body: JSON.stringify({ name }) }),
    assignSegment: (accountId: string, segmentId: string | null) => request(`/api/v1/accounts/${encodeURIComponent(accountId)}/segment`, z.object({ accountId: z.string().uuid(), segmentId: z.string().uuid().nullable(), segmentName: z.string().nullable() }), { method: 'PATCH', body: JSON.stringify({ segmentId }) }),
    updateProfile: (accountId: string, profile: z.infer<typeof accountProfileSchema>) => request(`/api/v1/accounts/${encodeURIComponent(accountId)}/profile`, z.object({ accountId: z.string().uuid(), ...accountProfileSchema.shape }), { method: 'PATCH', body: JSON.stringify(profile) }),
    listPage: (params: { search?: string; leadStatus?: LeadStatus; segmentId?: string; marketSegment?: AccountMarketSegment; withoutMarketSegment?: boolean; studentCountMin?: number; studentCountMax?: number; sortBy?: AccountSortBy; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.search) search.set('search', params.search);
      if (params.leadStatus) search.set('leadStatus', params.leadStatus);
      if (params.segmentId) search.set('segmentId', params.segmentId);
      if (params.marketSegment) search.set('marketSegment', params.marketSegment);
      if (params.withoutMarketSegment) search.set('withoutMarketSegment', String(params.withoutMarketSegment));
      if (params.studentCountMin !== undefined) search.set('studentCountMin', String(params.studentCountMin));
      if (params.studentCountMax !== undefined) search.set('studentCountMax', String(params.studentCountMax));
      if (params.sortBy) search.set('sortBy', params.sortBy);
      if (params.sortDirection) search.set('sortDirection', params.sortDirection);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/accounts/table?${search.toString()}`, accountPageSchema);
    },
  },
  tasks: {
    list: (params: { taskId?: string; from?: string; to?: string; assignedToUserId?: string; status?: TaskDto['status']; search?: string; sortBy?: 'dueAt' | 'title' | 'accountName' | 'contactName'; sortDirection?: 'asc' | 'desc'; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.taskId) search.set('taskId', params.taskId);
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.status) search.set('status', params.status);
      if (params.search) search.set('search', params.search);
      if (params.sortBy) search.set('sortBy', params.sortBy);
      if (params.sortDirection) search.set('sortDirection', params.sortDirection);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/leads/tasks?${search.toString()}`, z.array(taskSchema));
    },
    listPage: (params: { taskId?: string; from?: string; to?: string; assignedToUserId?: string; status?: TaskDto['status']; search?: string; sortBy: 'dueAt' | 'title' | 'accountName' | 'contactName'; sortDirection: 'asc' | 'desc'; limit: number; offset: number }) => {
      const search = new URLSearchParams();
      if (params.taskId) search.set('taskId', params.taskId);
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.status) search.set('status', params.status);
      if (params.search) search.set('search', params.search);
      search.set('sortBy', params.sortBy); search.set('sortDirection', params.sortDirection);
      search.set('limit', String(params.limit)); search.set('offset', String(params.offset));
      return request(`/api/v1/leads/tasks/page?${search.toString()}`, taskPageSchema);
    },
    create: (leadId: string, input: { title: string; dueAt: string }) => request(`/api/v1/leads/${encodeURIComponent(leadId)}/tasks`, taskSchema, { method: 'POST', body: JSON.stringify(input) }),
    complete: (id: string, input: { result: z.infer<typeof taskResult>; resultNote?: string; followUp?: { title: string; dueAt: string } }) => request(`/api/v1/leads/tasks/${encodeURIComponent(id)}/complete`, taskSchema, { method: 'PATCH', body: JSON.stringify(input) }),
  },
  handoffs: {
    list: (status: HandoffDto['status'] = 'requested', params: { limit?: number; offset?: number; handoffId?: string } = {}) => {
      const search = new URLSearchParams({ status, limit: String(params.limit ?? 100) });
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      if (params.handoffId) search.set('handoffId', params.handoffId);
      return request(`/api/v1/handoffs?${search.toString()}`, z.array(handoffSchema));
    },
    listPage: (status: HandoffDto['status'], params: { limit: number; offset: number; handoffId?: string; search?: string; sortBy: 'requestedAt' | 'accountName' | 'contactName' | 'nextStepAt'; sortDirection: 'asc' | 'desc' }) => {
      const search = new URLSearchParams({ status, limit: String(params.limit), offset: String(params.offset), sortBy: params.sortBy, sortDirection: params.sortDirection });
      if (params.handoffId) search.set('handoffId', params.handoffId);
      if (params.search) search.set('search', params.search);
      return request(`/api/v1/handoffs/page?${search.toString()}`, handoffPageSchema);
    },
    create: (input: { leadId: string; reason: string; evidence: string; confirmedFacts: string[]; unknowns: string[]; nextStep: string; nextStepAt: string }) => request('/api/v1/handoffs', handoffSchema, { method: 'POST', body: JSON.stringify(input) }),
    accept: (id: string) => request(`/api/v1/handoffs/${encodeURIComponent(id)}/accept`, handoffSchema, { method: 'PATCH' }),
    returnToSdr: (id: string, input: { reason: string; nextStep: string; dueAt: string }) => request(`/api/v1/handoffs/${encodeURIComponent(id)}/return`, handoffSchema, { method: 'PATCH', body: JSON.stringify(input) }),
  },
  opportunities: {
    pipelines: {
      list: () => request('/api/v1/opportunities/pipelines', pipelinesSchema),
      create: (name: string) => request('/api/v1/opportunities/pipelines', pipelinesSchema, { method: 'POST', body: JSON.stringify({ name }) }),
      rename: (id: string, name: string) => request(`/api/v1/opportunities/pipelines/${encodeURIComponent(id)}`, pipelinesSchema, { method: 'PATCH', body: JSON.stringify({ name }) }),
      setDefault: (id: string) => request(`/api/v1/opportunities/pipelines/${encodeURIComponent(id)}/default`, pipelinesSchema, { method: 'PATCH' }),
      archive: (id: string) => request(`/api/v1/opportunities/pipelines/${encodeURIComponent(id)}`, pipelinesSchema, { method: 'DELETE' }),
    },
    pipelineStages: {
      list: (pipelineId?: string) => request(`/api/v1/opportunities/pipeline-stages${pipelineId ? `?pipelineId=${encodeURIComponent(pipelineId)}` : ''}`, pipelineStagesSchema),
      create: (input: { pipelineId: string; name: string; afterStageKey: string }) => request('/api/v1/opportunities/pipeline-stages', pipelineStagesSchema, { method: 'POST', body: JSON.stringify(input) }),
      update: (key: string, input: { pipelineId: string; name: string }) => request(`/api/v1/opportunities/pipeline-stages/${encodeURIComponent(key)}`, pipelineStagesSchema, { method: 'PATCH', body: JSON.stringify(input) }),
      reorder: (pipelineId: string, stageKeys: string[]) => request('/api/v1/opportunities/pipeline-stages/order', pipelineStagesSchema, { method: 'PATCH', body: JSON.stringify({ pipelineId, stageKeys }) }),
      archive: (pipelineId: string, key: string) => request(`/api/v1/opportunities/pipeline-stages/${encodeURIComponent(key)}?pipelineId=${encodeURIComponent(pipelineId)}`, pipelineStagesSchema, { method: 'DELETE' }),
    },
    assignees: () => request('/api/v1/opportunities/assignees', z.array(opportunityAssigneeSchema)),
    assignOwner: (id: string, ownerUserId: string | null) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/owner`, opportunitySchema, { method: 'PATCH', body: JSON.stringify({ ownerUserId }) }),
    list: (params: { view?: 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'; stage?: OpportunityStage; pipelineStageKey?: string; assignedToUserId?: string; dueAfter?: string; dueBefore?: string; noNextAction?: boolean; search?: string; opportunityId?: string; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.view) search.set('view', params.view);
      if (params.stage) search.set('stage', params.stage);
      if (params.pipelineStageKey) search.set('pipelineStageKey', params.pipelineStageKey);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.dueAfter) search.set('dueAfter', params.dueAfter);
      if (params.dueBefore) search.set('dueBefore', params.dueBefore);
      if (params.noNextAction) search.set('noNextAction', 'true');
      if (params.search) search.set('search', params.search);
      if (params.opportunityId) search.set('opportunityId', params.opportunityId);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/opportunities?${search.toString()}`, z.array(opportunitySchema));
    },
    listPage: (params: { pipelineId?: string; view?: 'mine' | 'all' | 'unassigned' | 'no_next_action' | 'overdue' | 'stale'; stage?: OpportunityStage; pipelineStageKey?: string; assignedToUserId?: string; dueAfter?: string; dueBefore?: string; noNextAction?: boolean; opportunityId?: string; search?: string; sortBy: 'nextActionAt' | 'accountName' | 'contactName' | 'stageChangedAt' | 'opportunityName' | 'stage' | 'ownerName'; sortDirection: 'asc' | 'desc'; limit: number; offset: number }) => {
      const search = new URLSearchParams({ view: params.view ?? 'mine', sortBy: params.sortBy, sortDirection: params.sortDirection, limit: String(params.limit), offset: String(params.offset) });
      if (params.stage) search.set('stage', params.stage);
      if (params.pipelineId) search.set('pipelineId', params.pipelineId);
      if (params.pipelineStageKey) search.set('pipelineStageKey', params.pipelineStageKey);
      if (params.assignedToUserId) search.set('assignedToUserId', params.assignedToUserId);
      if (params.dueAfter) search.set('dueAfter', params.dueAfter);
      if (params.dueBefore) search.set('dueBefore', params.dueBefore);
      if (params.noNextAction) search.set('noNextAction', 'true');
      if (params.opportunityId) search.set('opportunityId', params.opportunityId);
      if (params.search) search.set('search', params.search);
      return request(`/api/v1/opportunities/page?${search.toString()}`, opportunityPageSchema);
    },
    transition: (id: string, input: { expectedPipelineId: string; pipelineId: string; expectedStage: OpportunityStage; expectedPipelineStageKey?: string; stage: OpportunityStage; pipelineStageKey?: string; reason?: string; nextAction?: string; nextActionAt?: string; amount?: string; currency?: string; closedAt?: string; lossReason?: string }) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/stage`, opportunitySchema, { method: 'PATCH', body: JSON.stringify(input) }),
    history: (id: string) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/history`, z.array(opportunityHistorySchema)),
    activities: {
      list: (id: string) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/activities`, z.array(activitySchema)),
      create: (id: string, input: { type: ActivityType; subject: string; details?: string; result?: string; occurredAt: string }) => request(`/api/v1/opportunities/${encodeURIComponent(id)}/activities`, activitySchema, { method: 'POST', body: JSON.stringify(input) }),
    },
  },
  reports: {
    funnel: (from: string, to: string) => request(`/api/v1/reports/funnel?${new URLSearchParams({ from, to })}`, funnelReportSchema),
    aiUsage: (from: string, to: string) => request(`/api/v1/reports/ai-usage?${new URLSearchParams({ from, to })}`, aiUsageReportSchema),
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
  platform: {
    organizations: (params: { search?: string; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.search) search.set('search', params.search);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`${PLATFORM_ORGANIZATION_API_PATH}?${search.toString()}`, platformOrganizationPageSchema);
    },
    createOrganization: (input: CreatePlatformOrganizationInput) => request(PLATFORM_ORGANIZATION_API_PATH, platformOrganizationCreateSchema, { method: 'POST', body: JSON.stringify(input) }),
  },
  auth: {
    setActiveOrganization: (organizationId: string) => authClient.organization.setActive({ organizationId }),
    signOut: () => authClient.signOut(),
    signInEmail: (input: { email: string; password: string; rememberMe?: boolean; callbackURL?: string }) => authClient.signIn.email(input),
    async requestPasswordReset(input: { email: string; redirectTo: string }): Promise<{ error: { message: string } | null }> {
      const result = await authClient.requestPasswordReset(input);
      return { error: authError(result) };
    },
    async resetPassword(input: { newPassword: string; token: string }): Promise<{ error: { message: string } | null }> {
      const result = await authClient.resetPassword(input);
      return { error: authError(result) };
    },
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
