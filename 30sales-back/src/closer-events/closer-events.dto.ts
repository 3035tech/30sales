import { z } from 'zod';

export const listCloserEventsSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListCloserEventsQueryDto = z.infer<typeof listCloserEventsSchema>;
export class CloserEventsListDto { constructor(readonly organizationId: string, readonly userId: string, readonly query: ListCloserEventsQueryDto) {} }
export class CloserEventDto {
  constructor(readonly id: string, readonly eventType: string, readonly priority: string, readonly status: string, readonly conversationId: string, readonly opportunityId: string, readonly accountName: string, readonly contactName: string, readonly summary: string, readonly evidence: string | null, readonly occurredAt: string, readonly acknowledgedAt: string | null) {}
}
export class CloserEventsPageDto { constructor(readonly data: CloserEventDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class CloserEventAcknowledgeDto { constructor(readonly organizationId: string, readonly eventId: string, readonly userId: string, readonly correlationId: string | null) {} }
export class CloserEventStateDto { constructor(readonly id: string, readonly status: string, readonly acknowledgedAt: string | null) {} }
