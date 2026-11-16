import { z } from 'zod';
import { LEAD_SOURCES, LEAD_STATUSES, UNASSIGNED_SEGMENT_FILTER } from './constants';
import { ACCOUNT_MARKET_SEGMENTS, QUERY_BOOLEAN_VALUES } from '../accounts/accounts.constants';
export const createLeadSchema = z.object({ accountName: z.string().trim().min(2).max(160), contactName: z.string().trim().min(2).max(160).optional().or(z.literal('')), email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(), phone: z.string().trim().max(40).optional(), source: z.enum(LEAD_SOURCES).default('manual'), duplicateOverrideReason: z.string().trim().min(3).max(500).optional() }).strict().superRefine((input, context) => {
  if ((input.email || input.phone) && !input.contactName?.trim()) context.addIssue({ code: 'custom', path: ['contactName'], message: 'Informe o nome do contato quando preencher e-mail ou telefone.' });
});
export type CreateLeadDto = z.infer<typeof createLeadSchema>;
export const leadDuplicateCheckSchema = z.object({ accountName: z.string().trim().min(2).max(160), email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(), phone: z.string().trim().max(40).optional() }).strict();
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
export class LeadContactRecordDto {
  constructor(readonly id: string, readonly name: string, readonly email: string | null, readonly phone: string | null, readonly jobTitle: string | null, readonly isPrimary: boolean, readonly isInterested: boolean, readonly hasConversation: boolean, readonly referralNote: string | null, readonly notes: string | null) {}
}
export class LeadRepositoryAccessDto { constructor(readonly organizationId: string, readonly userId: string, readonly canManageAll: boolean, readonly includeOwnedOpportunities: boolean) {} }
export class LeadContactRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly actorUserId: string, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class LeadContactCreateRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly actorUserId: string, readonly input: CreateLeadContactDto, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class LeadContactUpdateRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly contactId: string, readonly actorUserId: string, readonly input: UpdateLeadContactDto, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class LeadContactPrimaryRepositoryDto { constructor(readonly organizationId: string, readonly leadId: string, readonly contactId: string, readonly actorUserId: string, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class LeadDuplicateCandidateDto { constructor(readonly id: string, readonly accountName: string, readonly contactName: string | null, readonly status: (typeof LEAD_STATUSES)[number], readonly source: string, readonly matchedBy: Array<'account_name' | 'email' | 'phone'>) {} }
export class LeadDuplicateCheckResponseDto { constructor(readonly candidates: LeadDuplicateCandidateDto[]) {} }
export const listLeadsSchema = z.object({ status: z.enum(LEAD_STATUSES).optional(), source: z.enum(LEAD_SOURCES).optional(), assignedToUserId: z.union([z.string().uuid(), z.literal('unassigned')]).optional(), segmentId: z.union([z.string().uuid(), z.literal(UNASSIGNED_SEGMENT_FILTER)]).optional(), marketSegment: z.enum(ACCOUNT_MARKET_SEGMENTS).optional(), withoutMarketSegment: z.enum([QUERY_BOOLEAN_VALUES.enabled, QUERY_BOOLEAN_VALUES.disabled]).transform((value) => value === QUERY_BOOLEAN_VALUES.enabled).optional(), studentCountMin: z.coerce.number().int().nonnegative().optional(), studentCountMax: z.coerce.number().int().nonnegative().optional(), search: z.string().trim().max(200).optional(), sortBy: z.enum(['accountName','contactName','channel','source','status','segment','assignedTo','nextActionAt','createdAt']).default('nextActionAt'), sortDirection: z.enum(['asc','desc']).default('asc'), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).strict().superRefine((query, context) => {
  if (query.studentCountMin !== undefined && query.studentCountMax !== undefined && query.studentCountMin > query.studentCountMax) context.addIssue({ code: 'custom', path: ['studentCountMax'], message: 'Maximum student count must be greater than or equal to the minimum.' });
});
export type ListLeadsQueryDto = z.infer<typeof listLeadsSchema>;
export const updateLeadStatusSchema = z.object({ status: z.enum(LEAD_STATUSES), reason: z.string().trim().min(3).max(1000) }).strict();
export type UpdateLeadStatusDto = z.infer<typeof updateLeadStatusSchema>;
export class LeadRepositoryCreateDto { constructor(readonly organizationId: string, readonly createdByUserId: string, readonly accountName: string, readonly contactName: string | null, readonly email: string | null, readonly phone: string | null, readonly source: CreateLeadDto['source'], readonly duplicateOverrideReason: string | null, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class LeadRecordDto { constructor(readonly id: string, readonly accountId: string, readonly accountName: string, readonly accountSegmentId: string | null, readonly accountSegmentName: string | null, readonly accountMarketSegment: (typeof ACCOUNT_MARKET_SEGMENTS)[number] | null, readonly accountStudentCount: number | null, readonly contactName: string | null, readonly email: string | null, readonly phone: string | null, readonly source: string, readonly status: (typeof LEAD_STATUSES)[number], readonly nextActionAt: string | null, readonly createdAt: string, readonly updatedAt: string, readonly assignedToUserId: string | null, readonly assignedToName: string | null) {} }
export class LeadStatusRepositoryUpdateDto { constructor(readonly organizationId: string, readonly leadId: string, readonly status: UpdateLeadStatusDto['status']) {} }
export class TenantContextDto { constructor(readonly userId: string, readonly organizationId: string, readonly role: string) {} }

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

export const createTaskSchema = z.object({ title: z.string().trim().min(2).max(240), dueAt: z.string().datetime({ offset: true }) }).strict();
export type CreateTaskDto = z.infer<typeof createTaskSchema>;
const taskFollowUpSchema = z.object({ title: z.string().trim().min(2).max(240), dueAt: z.string().datetime({ offset: true }) }).strict();
export const completeTaskSchema = z.object({ result: z.enum(['completed', 'contacted', 'no_response', 'follow_up']).default('completed'), resultNote: z.string().trim().max(2000).optional(), followUp: taskFollowUpSchema.optional() }).strict().superRefine((input, context) => {
  if (input.result === 'follow_up' && !input.followUp) context.addIssue({ code: 'custom', path: ['followUp'], message: 'A follow-up task is required for this result.' });
  if (input.result !== 'follow_up' && input.followUp) context.addIssue({ code: 'custom', path: ['followUp'], message: 'A follow-up task is only allowed for the follow-up result.' });
}).default({ result: 'completed' });
export type CompleteTaskDto = z.infer<typeof completeTaskSchema>;
export const listTasksSchema = z.object({ taskId: z.string().uuid().optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), assignedToUserId: z.string().uuid().optional(), status: z.enum(['open', 'completed', 'cancelled']).optional(), search: z.string().trim().max(200).optional(), sortBy: z.enum(['dueAt', 'title', 'accountName', 'contactName']).default('dueAt'), sortDirection: z.enum(['asc', 'desc']).default('asc'), limit: z.coerce.number().int().min(1).max(100).default(100), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListTasksQueryDto = z.infer<typeof listTasksSchema>;
export class TaskRecordDto { constructor(readonly id: string, readonly leadId: string, readonly title: string, readonly dueAt: string, readonly status: 'open' | 'completed' | 'cancelled', readonly completedAt: string | null, readonly accountName: string, readonly contactName: string | null, readonly completionResult: 'completed' | 'contacted' | 'no_response' | 'follow_up' | null, readonly completionNote: string | null) {} }
export class TaskPageDto { constructor(readonly data: TaskRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class TaskRepositoryListDto { constructor(readonly organizationId: string, readonly userId: string, readonly canManageAll: boolean, readonly query: ListTasksQueryDto) {} }
export class TaskRepositoryCreateDto { constructor(readonly organizationId: string, readonly leadId: string, readonly createdByUserId: string, readonly title: string, readonly dueAt: Date, readonly access: LeadRepositoryAccessDto, readonly correlationId: string | null = null) {} }
export class TaskRepositoryCompleteDto { constructor(readonly organizationId: string, readonly taskId: string, readonly actorUserId: string, readonly canManageAll: boolean, readonly completedAt: Date, readonly input: CompleteTaskDto, readonly correlationId: string | null = null) {} }
