import { z } from 'zod';

export const closerEventTypeValues = ['qualified_handoff', 'human_requested', 'buying_intent', 'closer_question', 'lead_replied_after_handoff', 'interpretation_failure'] as const;
export const closerEventSlaPoliciesInputSchema = z.object({
  policies: z.array(z.object({ eventType: z.enum(closerEventTypeValues), targetMinutes: z.number().int().min(1).max(10080).nullable() }).strict()).max(closerEventTypeValues.length),
}).strict().refine((input) => new Set(input.policies.map((policy) => policy.eventType)).size === input.policies.length, { message: 'SLA policy event types must be unique.' });
export type CloserEventSlaPoliciesInputDto = z.infer<typeof closerEventSlaPoliciesInputSchema>;

export const listCloserEventsSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListCloserEventsQueryDto = z.infer<typeof listCloserEventsSchema>;
export const closerEventActionSchema = z.object({ action: z.enum(['acknowledge', 'snooze', 'reassign', 'resolve']), snoozedUntil: z.string().datetime({ offset: true }).optional(), assignedToUserId: z.string().uuid().optional() }).strict()
  .refine((input) => input.action === 'snooze' ? Boolean(input.snoozedUntil) : input.snoozedUntil === undefined, { message: 'snoozedUntil is required only when snoozing.' })
  .refine((input) => input.action === 'reassign' ? Boolean(input.assignedToUserId) : input.assignedToUserId === undefined, { message: 'assignedToUserId is required only when reassigning.' });
export type CloserEventActionInputDto = z.infer<typeof closerEventActionSchema>;
export class CloserEventsListDto { constructor(readonly organizationId: string, readonly userId: string, readonly query: ListCloserEventsQueryDto) {} }
export class CloserEventDto {
  constructor(readonly id: string, readonly eventType: string, readonly priority: string, readonly status: string, readonly conversationId: string, readonly opportunityId: string, readonly assignedToUserId: string, readonly accountName: string, readonly contactName: string, readonly summary: string, readonly evidence: string | null, readonly occurredAt: string, readonly dueAt: string | null, readonly acknowledgedAt: string | null, readonly snoozedUntil: string | null) {}
}
export class CloserEventSlaPolicyDto { constructor(readonly eventType: string, readonly targetMinutes: number | null) {} }
export class CloserEventSlaSettingsDto { constructor(readonly policies: CloserEventSlaPolicyDto[], readonly canManage: boolean) {} }
export class CloserEventSlaPoliciesSaveDto { constructor(readonly organizationId: string, readonly userId: string, readonly input: CloserEventSlaPoliciesInputDto, readonly correlationId: string | null) {} }
export class CloserEventsPageDto { constructor(readonly data: CloserEventDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }
export class CloserEventMutationDto { constructor(readonly organizationId: string, readonly eventId: string, readonly actorUserId: string, readonly actorRole: string, readonly input: CloserEventActionInputDto, readonly correlationId: string | null) {} }
export class CloserEventStateDto { constructor(readonly id: string, readonly status: string, readonly assignedToUserId: string, readonly acknowledgedAt: string | null, readonly snoozedUntil: string | null, readonly resolvedAt: string | null) {} }
export class CloserEventAssigneeDto { constructor(readonly id: string, readonly name: string) {} }
