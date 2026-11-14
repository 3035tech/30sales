import { z } from 'zod';
import { LEAD_SOURCES, LEAD_STATUSES } from './constants';
export const createLeadSchema = z.object({ accountName: z.string().trim().min(2).max(160), contactName: z.string().trim().min(2).max(160), email: z.union([z.string().trim().email().max(254), z.literal('')]).optional(), phone: z.string().trim().max(40).optional(), source: z.enum(LEAD_SOURCES).default('manual') }).strict().refine((input) => Boolean(input.email || input.phone), { message: 'Informe um e-mail ou telefone para contato', path: ['email'] });
export type CreateLeadDto = z.infer<typeof createLeadSchema>;
export const listLeadsSchema = z.object({ status: z.enum(LEAD_STATUSES).optional(), source: z.enum(LEAD_SOURCES).optional(), assignedToUserId: z.union([z.string().uuid(), z.literal('unassigned')]).optional(), search: z.string().trim().max(200).optional(), sortBy: z.enum(['accountName','contactName','channel','source','status','assignedTo','nextActionAt','createdAt']).default('nextActionAt'), sortDirection: z.enum(['asc','desc']).default('asc'), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListLeadsQueryDto = z.infer<typeof listLeadsSchema>;
export const updateLeadStatusSchema = z.object({ status: z.enum(LEAD_STATUSES), reason: z.string().trim().min(3).max(1000) }).strict();
export type UpdateLeadStatusDto = z.infer<typeof updateLeadStatusSchema>;
export class LeadRepositoryCreateDto { constructor(readonly organizationId: string, readonly createdByUserId: string, readonly accountName: string, readonly contactName: string, readonly email: string | null, readonly phone: string | null, readonly source: CreateLeadDto['source'], readonly correlationId: string | null = null) {} }
export class LeadRecordDto { constructor(readonly id: string, readonly accountName: string, readonly contactName: string, readonly email: string | null, readonly phone: string | null, readonly source: string, readonly status: (typeof LEAD_STATUSES)[number], readonly nextActionAt: string | null, readonly createdAt: string, readonly updatedAt: string, readonly assignedToUserId: string | null, readonly assignedToName: string | null) {} }
export class LeadStatusRepositoryUpdateDto { constructor(readonly organizationId: string, readonly leadId: string, readonly status: UpdateLeadStatusDto['status']) {} }
export class TenantContextDto { constructor(readonly userId: string, readonly organizationId: string, readonly role: string) {} }

export class LeadRepositoryListDto {
  constructor(readonly organizationId: string, readonly query: ListLeadsQueryDto) {}
}
export class LeadPageDto { constructor(readonly data: LeadRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class LeadRepositoryFindDto {
  constructor(readonly organizationId: string, readonly leadId: string) {}
}
export class LeadRepositoryStatusChangeDto {
  constructor(readonly organizationId: string, readonly leadId: string, readonly status: UpdateLeadStatusDto['status'], readonly expectedStatus: (typeof LEAD_STATUSES)[number], readonly reason: string, readonly changedByUserId: string, readonly correlationId: string | null = null) {}
}
export const assignLeadSchema = z.object({ assignedToUserId: z.string().uuid().nullable() }).strict();
export type AssignLeadDto = z.infer<typeof assignLeadSchema>;
export class LeadRepositoryAssignDto { constructor(readonly organizationId: string, readonly leadId: string, readonly assignedToUserId: string | null, readonly actorUserId: string, readonly correlationId: string | null = null) {} }
export class LeadAssigneeDto { constructor(readonly id: string, readonly name: string, readonly role: string) {} }

export const createTaskSchema = z.object({ title: z.string().trim().min(2).max(240), dueAt: z.string().datetime({ offset: true }) }).strict();
export type CreateTaskDto = z.infer<typeof createTaskSchema>;
const taskFollowUpSchema = z.object({ title: z.string().trim().min(2).max(240), dueAt: z.string().datetime({ offset: true }) }).strict();
export const completeTaskSchema = z.object({ result: z.enum(['completed', 'contacted', 'no_response', 'follow_up']).default('completed'), resultNote: z.string().trim().max(2000).optional(), followUp: taskFollowUpSchema.optional() }).strict().superRefine((input, context) => {
  if (input.result === 'follow_up' && !input.followUp) context.addIssue({ code: 'custom', path: ['followUp'], message: 'A follow-up task is required for this result.' });
  if (input.result !== 'follow_up' && input.followUp) context.addIssue({ code: 'custom', path: ['followUp'], message: 'A follow-up task is only allowed for the follow-up result.' });
}).default({ result: 'completed' });
export type CompleteTaskDto = z.infer<typeof completeTaskSchema>;
export const listTasksSchema = z.object({ from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), assignedToUserId: z.string().uuid().optional(), status: z.enum(['open', 'completed', 'cancelled']).default('open'), limit: z.coerce.number().int().min(1).max(100).default(100) }).strict();
export type ListTasksQueryDto = z.infer<typeof listTasksSchema>;
export class TaskRecordDto { constructor(readonly id: string, readonly leadId: string, readonly title: string, readonly dueAt: string, readonly status: 'open' | 'completed' | 'cancelled', readonly completedAt: string | null, readonly accountName: string, readonly contactName: string, readonly completionResult: 'completed' | 'contacted' | 'no_response' | 'follow_up' | null, readonly completionNote: string | null) {} }
export class TaskRepositoryListDto { constructor(readonly organizationId: string, readonly query: ListTasksQueryDto) {} }
export class TaskRepositoryCreateDto { constructor(readonly organizationId: string, readonly leadId: string, readonly createdByUserId: string, readonly title: string, readonly dueAt: Date, readonly correlationId: string | null = null) {} }
export class TaskRepositoryCompleteDto { constructor(readonly organizationId: string, readonly taskId: string, readonly actorUserId: string, readonly completedAt: Date, readonly input: CompleteTaskDto, readonly correlationId: string | null = null) {} }
