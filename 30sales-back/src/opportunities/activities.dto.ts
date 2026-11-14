import { z } from 'zod';

export const ACTIVITY_TYPES = ['call', 'meeting', 'email', 'message', 'task', 'note', 'research'] as const;
export const createActivitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  subject: z.string().trim().min(2).max(240),
  details: z.string().trim().max(5000).optional(),
  result: z.string().trim().max(1000).optional(),
  occurredAt: z.string().datetime({ offset: true }),
}).strict();
export type CreateActivityDto = z.infer<typeof createActivitySchema>;

export class ActivityRecordDto {
  constructor(
    readonly id: string,
    readonly type: (typeof ACTIVITY_TYPES)[number],
    readonly subject: string,
    readonly details: string | null,
    readonly result: string | null,
    readonly occurredAt: string,
    readonly actorName: string,
    readonly createdAt: string,
  ) {}
}
export class ActivityRepositoryListDto { constructor(readonly organizationId: string, readonly opportunityId: string) {} }
export class ActivityRepositoryCreateDto { constructor(readonly organizationId: string, readonly opportunityId: string, readonly actorUserId: string, readonly canManageAll: boolean, readonly input: CreateActivityDto) {} }
