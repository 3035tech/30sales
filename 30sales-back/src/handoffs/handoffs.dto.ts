import { z } from 'zod';

export const createHandoffSchema = z.object({
  leadId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
  evidence: z.string().trim().min(3).max(2000),
  confirmedFacts: z.array(z.string().trim().min(1).max(500)).max(30),
  unknowns: z.array(z.string().trim().min(1).max(500)).max(30),
  nextStep: z.string().trim().min(3).max(500),
  nextStepAt: z.string().datetime({ offset: true }),
}).strict();
export type CreateHandoffDto = z.infer<typeof createHandoffSchema>;

export const listHandoffsSchema = z.object({ status: z.enum(['requested', 'accepted', 'returned']).default('requested'), handoffId: z.string().uuid().optional(), search: z.string().trim().max(200).optional(), sortBy: z.enum(['requestedAt', 'accountName', 'contactName', 'nextStepAt']).default('requestedAt'), sortDirection: z.enum(['asc', 'desc']).default('desc'), limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListHandoffsQueryDto = z.infer<typeof listHandoffsSchema>;
export const returnHandoffSchema = z.object({ reason: z.string().trim().min(3).max(1000), nextStep: z.string().trim().min(3).max(500), dueAt: z.string().datetime({ offset: true }) }).strict();
export type ReturnHandoffDto = z.infer<typeof returnHandoffSchema>;

export type HandoffStatus = 'requested' | 'accepted' | 'returned';
export class HandoffRecordDto {
  constructor(
    readonly id: string,
    readonly opportunityId: string,
    readonly conversationId: string | null,
    readonly leadId: string,
    readonly opportunityName: string,
    readonly accountName: string,
    readonly contactName: string,
    readonly status: HandoffStatus,
    readonly reason: string,
    readonly evidence: string,
    readonly confirmedFacts: string[],
    readonly unknowns: string[],
    readonly nextStep: string,
    readonly nextStepAt: string,
    readonly requestedByName: string,
    readonly closerName: string | null,
    readonly returnReason: string | null,
    readonly requestedAt: string,
    readonly acceptedAt: string | null,
    readonly firstActivityAt: string | null,
  ) {}
}
export class HandoffPageDto { constructor(readonly data: HandoffRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class HandoffRepositoryCreateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly input: CreateHandoffDto, readonly correlationId: string | null = null) {} }
export class HandoffRepositoryListDto { constructor(readonly organizationId: string, readonly userId: string, readonly canManageAll: boolean, readonly isCloser: boolean, readonly query: ListHandoffsQueryDto) {} }
export class HandoffRepositoryAcceptDto { constructor(readonly organizationId: string, readonly handoffId: string, readonly actorUserId: string, readonly correlationId: string | null = null) {} }
export class HandoffRepositoryReturnDto { constructor(readonly organizationId: string, readonly handoffId: string, readonly actorUserId: string, readonly canManageAll: boolean, readonly input: ReturnHandoffDto, readonly correlationId: string | null = null) {} }
