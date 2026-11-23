import { z } from 'zod';
import { CONTACT_OUTREACH_BASES, CONTACT_OUTREACH_DECISION, CONTACT_OUTREACH_DECISIONS, LEAD_SOURCES, LEAD_STATUSES, SDR_PREVIEW_MAX_PAGE_SIZE, SDR_PREVIEW_PAGE_SIZE, SDR_READINESS_BLOCKERS, UNASSIGNED_SEGMENT_FILTER } from './constants';
import { ACCOUNT_MARKET_SEGMENTS, QUERY_BOOLEAN_VALUES } from '../accounts/accounts.constants';
import { LEAD_ACCOUNT_CONTACT_MAX_PAGE_SIZE, LEAD_ACCOUNT_CONTACT_PAGE_SIZE, LEAD_QUALIFICATION_FACT_CONFIDENCE_MAX, LEAD_QUALIFICATION_FACT_CONFIDENCE_MIN, LEAD_QUALIFICATION_FACT_MAX_KEY_LENGTH, LEAD_QUALIFICATION_FACT_MAX_PAGE_SIZE, LEAD_QUALIFICATION_FACT_MAX_VALUE_LENGTH, LEAD_QUALIFICATION_FACT_MIN_EVIDENCE_LENGTH, LEAD_QUALIFICATION_FACT_MIN_KEY_LENGTH, LEAD_QUALIFICATION_FACT_MIN_VALUE_LENGTH, LEAD_QUALIFICATION_FACT_PAGE_SIZE, LEAD_QUALIFICATION_FACT_SOURCES, LEAD_QUALIFICATION_FACT_STATE, LEAD_QUALIFICATION_FACT_STATES, LEAD_QUALIFICATION_FACT_SOURCE, LEAD_QUALIFICATION_FACT_KEY, LEAD_QUALIFICATION_FACT_KEYS, LEAD_QUALIFICATION_SUGGESTION } from './constants';
export const createLeadSchema = z.object({ businessLineId: z.string().uuid().optional(), accountName: z.string().trim().min(2).max(160), contactName: z.string().trim().min(2).max(160).optional().or(z.literal('')), email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(), phone: z.string().trim().max(40).optional(), source: z.enum(LEAD_SOURCES).default('manual'), duplicateOverrideReason: z.string().trim().min(3).max(500).optional() }).strict().superRefine((input, context) => {
  if ((input.email || input.phone) && !input.contactName?.trim()) context.addIssue({ code: 'custom', path: ['contactName'], message: 'Informe o nome do contato quando preencher e-mail ou telefone.' });
});
export type CreateLeadDto = z.infer<typeof createLeadSchema>;
export const leadDuplicateCheckSchema = z.object({ businessLineId: z.string().uuid().optional(), accountName: z.string().trim().min(2).max(160), email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(), phone: z.string().trim().max(40).optional() }).strict();
export type LeadDuplicateCheckDto = z.infer<typeof leadDuplicateCheckSchema>;
export const createLeadContactSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(),
  phone: z.string().trim().max(40).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  isInterested: z.boolean().default(false),
  referralNote: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
}).strict();
export type CreateLeadContactDto = z.infer<typeof createLeadContactSchema>;
export const updateLeadContactSchema = z.object({ isInterested: z.boolean() }).strict();
export type UpdateLeadContactDto = z.infer<typeof updateLeadContactSchema>;
export const createQualificationFactSchema = z.object({
  factKey: z.string().trim().min(LEAD_QUALIFICATION_FACT_MIN_KEY_LENGTH).max(LEAD_QUALIFICATION_FACT_MAX_KEY_LENGTH).regex(/^[a-z][a-z0-9_]*$/),
  value: z.string().trim().min(LEAD_QUALIFICATION_FACT_MIN_VALUE_LENGTH).max(LEAD_QUALIFICATION_FACT_MAX_VALUE_LENGTH).nullable(),
  state: z.enum(LEAD_QUALIFICATION_FACT_STATES),
  source: z.enum(LEAD_QUALIFICATION_FACT_SOURCES).default(LEAD_QUALIFICATION_FACT_SOURCE.manual),
  evidence: z.string().trim().min(LEAD_QUALIFICATION_FACT_MIN_EVIDENCE_LENGTH).max(LEAD_QUALIFICATION_FACT_MAX_VALUE_LENGTH).nullable().optional(),
  sourceMessageId: z.string().uuid().optional(),
  confidence: z.number().min(LEAD_QUALIFICATION_FACT_CONFIDENCE_MIN).max(LEAD_QUALIFICATION_FACT_CONFIDENCE_MAX).nullable().optional(),
}).strict().superRefine((input, context) => {
  const valueless = input.state === LEAD_QUALIFICATION_FACT_STATE.unknown || input.state === LEAD_QUALIFICATION_FACT_STATE.notApplicable;
  if (valueless !== (input.value === null)) context.addIssue({ code: 'custom', path: ['value'], message: 'Fact value must match its state.' });
  if ((input.source === LEAD_QUALIFICATION_FACT_SOURCE.conversation) !== Boolean(input.sourceMessageId)) context.addIssue({ code: 'custom', path: ['sourceMessageId'], message: 'Conversation facts require a source message.' });
  if (input.source === LEAD_QUALIFICATION_FACT_SOURCE.conversation && !input.evidence?.trim()) context.addIssue({ code: 'custom', path: ['evidence'], message: 'Conversation facts require a quoted source excerpt.' });
  if (input.source === LEAD_QUALIFICATION_FACT_SOURCE.manual && !valueless && !input.evidence?.trim()) context.addIssue({ code: 'custom', path: ['evidence'], message: 'Manual facts require supporting evidence.' });
});
export type CreateQualificationFactDto = z.infer<typeof createQualificationFactSchema>;
export const qualificationSuggestionSchema = z.object({ factKey: z.enum(LEAD_QUALIFICATION_FACT_KEYS), value: z.string().trim().min(LEAD_QUALIFICATION_FACT_MIN_VALUE_LENGTH).max(LEAD_QUALIFICATION_FACT_MAX_VALUE_LENGTH).nullable(), state: z.enum(LEAD_QUALIFICATION_FACT_STATES), evidence: z.string().trim().min(LEAD_QUALIFICATION_FACT_MIN_EVIDENCE_LENGTH).max(LEAD_QUALIFICATION_SUGGESTION.evidenceMaxLength), sourceMessageId: z.string().uuid(), confidence: z.number().min(LEAD_QUALIFICATION_FACT_CONFIDENCE_MIN).max(LEAD_QUALIFICATION_FACT_CONFIDENCE_MAX) }).strict().superRefine((input, context) => {
  const valueless = input.state === LEAD_QUALIFICATION_FACT_STATE.unknown || input.state === LEAD_QUALIFICATION_FACT_STATE.notApplicable;
  if (valueless !== (input.value === null)) context.addIssue({ code: 'custom', path: ['value'], message: 'Fact value must match its state.' });
});
export type QualificationSuggestionDto = z.infer<typeof qualificationSuggestionSchema>;
export class QualificationSuggestionContextDto { constructor(readonly leadId: string, readonly model: string | null, readonly systemPrompt: string | null, readonly messages: Array<{ readonly id: string; readonly occurredAt: string; readonly content: string }>) {} }
export class QualificationSuggestionResultDto { constructor(readonly factKey: QualificationSuggestionDto['factKey'], readonly value: string | null, readonly state: QualificationSuggestionDto['state'], readonly evidence: string, readonly sourceMessageId: string, readonly sourceMessageAt: string, readonly confidence: number) {} }
export class QualificationSuggestionRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly actorUserId: string, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class QualificationSuggestionAuditDto { constructor(readonly organizationId: string, readonly leadId: string, readonly actorUserId: string, readonly model: string, readonly sourceMessageIds: string[], readonly suggestionCount: number, readonly usageInputTokens: number | null, readonly usageOutputTokens: number | null, readonly latencyMs: number, readonly correlationId: string | null) {} }
export const listQualificationFactsSchema = z.object({ limit: z.coerce.number().int().min(1).max(LEAD_QUALIFICATION_FACT_MAX_PAGE_SIZE).default(LEAD_QUALIFICATION_FACT_PAGE_SIZE), offset: z.coerce.number().int().nonnegative().default(0) }).strict();
export type ListQualificationFactsQueryDto = z.infer<typeof listQualificationFactsSchema>;
export class QualificationFactRecordDto { constructor(readonly id: string, readonly factKey: string, readonly value: string | null, readonly state: (typeof LEAD_QUALIFICATION_FACT_STATES)[number], readonly source: (typeof LEAD_QUALIFICATION_FACT_SOURCES)[number], readonly evidence: string | null, readonly sourceMessageId: string | null, readonly confidence: number | null, readonly createdByUserId: string, readonly recordedAt: string) {} }
export class QualificationFactPageDto { constructor(readonly data: QualificationFactRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class QualificationFactRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly actorUserId: string, readonly access: LeadRepositoryAccessDto, readonly input?: CreateQualificationFactDto, readonly correlationId: string | null = null, readonly query: ListQualificationFactsQueryDto = { limit: LEAD_QUALIFICATION_FACT_PAGE_SIZE, offset: 0 }) {} }
export class LeadContactRecordDto {
  constructor(readonly id: string, readonly name: string, readonly email: string | null, readonly phone: string | null, readonly jobTitle: string | null, readonly isPrimary: boolean, readonly isInterested: boolean, readonly hasConversation: boolean, readonly referralNote: string | null, readonly notes: string | null, readonly outreachDecision: (typeof CONTACT_OUTREACH_DECISIONS)[number] = CONTACT_OUTREACH_DECISION.pending, readonly outreachBasis: (typeof CONTACT_OUTREACH_BASES)[number] | null = null, readonly outreachEvidence: string | null = null, readonly outreachReviewedAt: string | null = null, readonly outreachReviewedByName: string | null = null) {}
}
export class LeadRepositoryAccessDto { constructor(readonly organizationId: string, readonly userId: string, readonly canManageAll: boolean, readonly includeOwnedOpportunities: boolean) {} }
export class LeadContactRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly actorUserId: string, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class LeadContactCreateRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly actorUserId: string, readonly input: CreateLeadContactDto, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export const listAccountContactsSchema = z.object({ limit: z.coerce.number().int().min(1).max(LEAD_ACCOUNT_CONTACT_MAX_PAGE_SIZE).default(LEAD_ACCOUNT_CONTACT_PAGE_SIZE), offset: z.coerce.number().int().nonnegative().default(0) }).strict();
export type ListAccountContactsQueryDto = z.infer<typeof listAccountContactsSchema>;
export const linkAccountContactSchema = z.object({ personId: z.string().uuid() }).strict();
export type LinkAccountContactDto = z.infer<typeof linkAccountContactSchema>;
export class AccountContactCandidateDto { constructor(readonly id: string, readonly name: string, readonly email: string | null, readonly phone: string | null) {} }
export class AccountContactPageDto { constructor(readonly data: AccountContactCandidateDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class AccountContactRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly access: LeadRepositoryAccessDto, readonly query: ListAccountContactsQueryDto) {} }
export class LinkAccountContactRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly personId: string, readonly actorUserId: string, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null) {} }
export class LeadContactUpdateRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly contactId: string, readonly actorUserId: string, readonly input: UpdateLeadContactDto, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export const reviewContactOutreachSchema = z.object({ decision: z.enum(CONTACT_OUTREACH_DECISIONS), basis: z.enum(CONTACT_OUTREACH_BASES).optional(), evidence: z.string().trim().max(2000).optional() }).strict().superRefine((input, context) => {
  if (input.decision === CONTACT_OUTREACH_DECISION.pending && (input.basis !== undefined || input.evidence !== undefined)) context.addIssue({ code: 'custom', path: ['basis'], message: 'Pending reviews cannot include a basis or evidence.' });
  if (input.decision !== CONTACT_OUTREACH_DECISION.pending && (!input.basis || !input.evidence || input.evidence.length < 3)) context.addIssue({ code: 'custom', path: ['evidence'], message: 'A basis and evidence are required to review contact outreach.' });
});
export type ReviewContactOutreachDto = z.infer<typeof reviewContactOutreachSchema>;
export class LeadContactOutreachReviewRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly contactId: string, readonly actorUserId: string, readonly input: ReviewContactOutreachDto, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class LeadContactPrimaryRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly contactId: string, readonly actorUserId: string, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class LeadDuplicateCandidateDto { constructor(readonly id: string, readonly accountName: string, readonly contactName: string | null, readonly status: (typeof LEAD_STATUSES)[number], readonly source: string, readonly matchedBy: Array<'account_name' | 'email' | 'phone'>) {} }
export class LeadDuplicateCheckResponseDto { constructor(readonly candidates: LeadDuplicateCandidateDto[]) {} }
export const listLeadsSchema = z.object({ businessLineId: z.string().uuid().optional(), status: z.enum(LEAD_STATUSES).optional(), source: z.enum(LEAD_SOURCES).optional(), assignedToUserId: z.union([z.string().uuid(), z.literal('unassigned')]).optional(), segmentId: z.union([z.string().uuid(), z.literal(UNASSIGNED_SEGMENT_FILTER)]).optional(), marketSegment: z.enum(ACCOUNT_MARKET_SEGMENTS).optional(), withoutMarketSegment: z.enum([QUERY_BOOLEAN_VALUES.enabled, QUERY_BOOLEAN_VALUES.disabled]).transform((value) => value === QUERY_BOOLEAN_VALUES.enabled).optional(), studentCountMin: z.coerce.number().int().nonnegative().optional(), studentCountMax: z.coerce.number().int().nonnegative().optional(), search: z.string().trim().max(200).optional(), sortBy: z.enum(['accountName','contactName','channel','source','status','segment','assignedTo','nextActionAt','createdAt']).default('nextActionAt'), sortDirection: z.enum(['asc','desc']).default('asc'), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().nonnegative().default(0) }).strict().superRefine((query, context) => {
  if (query.studentCountMin !== undefined && query.studentCountMax !== undefined && query.studentCountMin > query.studentCountMax) context.addIssue({ code: 'custom', path: ['studentCountMax'], message: 'Maximum student count must be greater than or equal to the minimum.' });
});
export type ListLeadsQueryDto = z.infer<typeof listLeadsSchema>;
export const updateLeadStatusSchema = z.object({ status: z.enum(LEAD_STATUSES), reason: z.string().trim().min(3).max(1000) }).strict();
export type UpdateLeadStatusDto = z.infer<typeof updateLeadStatusSchema>;
export class LeadRepositoryCreateDto { constructor(readonly organizationId: string, readonly createdByUserId: string, readonly accountName: string, readonly contactName: string | null, readonly email: string | null, readonly phone: string | null, readonly source: CreateLeadDto['source'], readonly duplicateOverrideReason: string | null, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null, readonly businessLineId: string | null = null) {} }
export class LeadRecordDto { constructor(readonly id: string, readonly accountId: string, readonly accountName: string, readonly accountSegmentId: string | null, readonly accountSegmentName: string | null, readonly accountMarketSegment: (typeof ACCOUNT_MARKET_SEGMENTS)[number] | null, readonly accountStudentCount: number | null, readonly contactName: string | null, readonly email: string | null, readonly phone: string | null, readonly source: string, readonly status: (typeof LEAD_STATUSES)[number], readonly nextActionAt: string | null, readonly createdAt: string, readonly updatedAt: string, readonly assignedToUserId: string | null, readonly assignedToName: string | null) {} }
export class LeadStatusRepositoryUpdateDto { constructor(readonly organizationId: string, readonly leadId: string, readonly status: UpdateLeadStatusDto['status']) {} }
export class TenantContextDto { constructor(readonly userId: string, readonly organizationId: string, readonly role: string, readonly isPlatformOrganizationContext = false) {} }

export class LeadRepositoryListDto {
  constructor(readonly organizationId: string, readonly query: ListLeadsQueryDto, readonly access: LeadRepositoryAccessDto) {}
}
export class LeadPageDto { constructor(readonly data: LeadRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class LeadRepositoryFindDto {
  constructor(readonly organizationId: string, readonly leadId: string, readonly access: LeadRepositoryAccessDto) {}
}
export class LeadRepositoryDuplicateCheckDto { constructor(readonly organizationId: string, readonly input: LeadDuplicateCheckDto, readonly access: LeadRepositoryAccessDto) {} }
export class LeadRepositoryStatusChangeDto {
  constructor(readonly organizationId: string, readonly leadId: string, readonly status: UpdateLeadStatusDto['status'], readonly expectedStatus: (typeof LEAD_STATUSES)[number], readonly reason: string, readonly changedByUserId: string, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {}
}
export const assignLeadSchema = z.object({ assignedToUserId: z.string().uuid().nullable() }).strict();
export type AssignLeadDto = z.infer<typeof assignLeadSchema>;
export class LeadRepositoryAssignDto { constructor(readonly organizationId: string, readonly leadId: string, readonly assignedToUserId: string | null, readonly actorUserId: string, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class LeadAssigneeDto { constructor(readonly id: string, readonly name: string, readonly role: string) {} }

export class SdrReadinessRepositoryInputDto { constructor(readonly organizationId: string, readonly leadId: string, readonly access: LeadRepositoryAccessDto) {} }
export class SdrReadinessDto { constructor(readonly leadId: string, readonly blockers: Array<(typeof SDR_READINESS_BLOCKERS)[number]>) {} }
export const listSdrPreviewSchema = z.object({ channelId: z.string().uuid().optional(), businessLineId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(SDR_PREVIEW_MAX_PAGE_SIZE).default(SDR_PREVIEW_PAGE_SIZE), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListSdrPreviewQueryDto = z.infer<typeof listSdrPreviewSchema>;
export class SdrPreviewRepositoryInputDto { constructor(readonly organizationId: string, readonly access: LeadRepositoryAccessDto, readonly query: ListSdrPreviewQueryDto) {} }
export class SdrPreviewLeadDto { constructor(readonly leadId: string, readonly accountName: string, readonly contactName: string | null, readonly source: (typeof LEAD_SOURCES)[number], readonly blockers: Array<(typeof SDR_READINESS_BLOCKERS)[number]>) {} }
export class SdrPreviewDto { constructor(readonly leads: SdrPreviewLeadDto[], readonly pageSummary: { readonly withoutBlockers: number; readonly blocked: number }, readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class SdrPreviewChannelDto { constructor(readonly id: string, readonly displayName: string, readonly phoneNumber: string, readonly isActive: boolean, readonly isConfigured: boolean, readonly businessLineId: string | null, readonly businessLineName: string | null) {} }

export const createTaskSchema = z.object({ title: z.string().trim().min(2).max(240), dueAt: z.string().datetime({ offset: true }) }).strict();
export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export const taskCompletionResultSchema = z.enum(['completed', 'contacted', 'no_response', 'follow_up']);
const taskFollowUpSchema = z.object({ title: z.string().trim().min(2).max(240), dueAt: z.string().datetime({ offset: true }) }).strict();
export const completeTaskSchema = z.object({ result: taskCompletionResultSchema.default('completed'), resultNote: z.string().trim().max(2000).optional(), followUp: taskFollowUpSchema.optional() }).strict().superRefine((input, context) => {
  if (input.result === 'follow_up' && !input.followUp) context.addIssue({ code: 'custom', path: ['followUp'], message: 'A follow-up task is required for this result.' });
  if (input.result !== 'follow_up' && input.followUp) context.addIssue({ code: 'custom', path: ['followUp'], message: 'A follow-up task is only allowed for the follow-up result.' });
}).default({ result: 'completed' });
export type CompleteTaskDto = z.infer<typeof completeTaskSchema>;
export const listTasksSchema = z.object({ taskId: z.string().uuid().optional(), businessLineId: z.string().uuid().optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), assignedToUserId: z.string().uuid().optional(), status: z.enum(['open', 'completed', 'cancelled']).optional(), search: z.string().trim().max(200).optional(), sortBy: z.enum(['dueAt', 'title', 'accountName', 'contactName']).default('dueAt'), sortDirection: z.enum(['asc', 'desc']).default('asc'), limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListTasksQueryDto = z.infer<typeof listTasksSchema>;
export class TaskRecordDto { constructor(readonly id: string, readonly leadId: string, readonly title: string, readonly dueAt: string, readonly status: 'open' | 'completed' | 'cancelled', readonly completedAt: string | null, readonly accountName: string, readonly contactName: string | null, readonly completionResult: z.infer<typeof taskCompletionResultSchema> | null, readonly completionNote: string | null) {} }
export class TaskPageDto { constructor(readonly data: TaskRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class TaskRepositoryListDto { constructor(readonly organizationId: string, readonly userId: string, readonly access: LeadRepositoryAccessDto, readonly query: ListTasksQueryDto) {} }
export class TaskRepositoryCreateDto { constructor(readonly organizationId: string, readonly leadId: string, readonly createdByUserId: string, readonly title: string, readonly dueAt: Date, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class TaskRepositoryCompleteDto { constructor(readonly organizationId: string, readonly taskId: string, readonly actorUserId: string, readonly access: LeadRepositoryAccessDto, readonly completedAt: Date, readonly input: CompleteTaskDto, readonly correlationId: string | null = null) {} }
