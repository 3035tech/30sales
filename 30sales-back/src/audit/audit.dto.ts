import { z } from 'zod';
import type { JsonValue } from '../db/schema';

export const listAuditEventsSchema = z.object({
  action: z.string().trim().min(1).max(120).optional(),
  entityType: z.string().trim().min(1).max(80).optional(),
  entityId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
export type ListAuditEventsQueryDto = z.infer<typeof listAuditEventsSchema>;
export class AuditRepositoryListDto { constructor(readonly organizationId: string, readonly query: ListAuditEventsQueryDto) {} }
export class AuditEventRecordDto {
  constructor(readonly id: string, readonly actorType: string, readonly actorName: string | null, readonly action: string, readonly entityType: string, readonly entityId: string | null, readonly reason: string | null, readonly beforeState: JsonValue | null, readonly afterState: JsonValue | null, readonly correlationId: string | null, readonly occurredAt: string) {}
}
export class AuditEventsPageDto { constructor(readonly data: AuditEventRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
