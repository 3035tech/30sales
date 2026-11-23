import { z } from 'zod';
import { BUSINESS_LINE_STATUSES } from './business-lines.constants';
export const businessLineStatusValues = BUSINESS_LINE_STATUSES;
export const createBusinessLineSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  description: z.string().trim().max(500).optional().transform((value) => value || null),
}).strict();
export const updateBusinessLineSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
  description: z.string().trim().max(500).optional().transform((value) => value || null),
  status: z.enum(BUSINESS_LINE_STATUSES).optional(),
}).strict().refine((input) => Object.keys(input).length > 0);
export const businessLineIdSchema = z.string().uuid();
export const setBusinessLineMembersSchema = z.object({ memberUserIds: z.array(z.string().uuid()).max(100).refine((ids) => new Set(ids).size === ids.length) }).strict();
export type CreateBusinessLineDto = z.infer<typeof createBusinessLineSchema>;
export type UpdateBusinessLineDto = z.infer<typeof updateBusinessLineSchema>;
export type SetBusinessLineMembersDto = z.infer<typeof setBusinessLineMembersSchema>;

export class BusinessLineRecordDto {
  constructor(
    readonly id: string,
    readonly name: string,
    readonly slug: string,
    readonly description: string | null,
    readonly status: (typeof businessLineStatusValues)[number],
    readonly isDefault: boolean,
    readonly memberCount: number,
    readonly createdAt: string,
  ) {}
}

export class BusinessLineListDto {
  constructor(readonly data: BusinessLineRecordDto[]) {}
}

export class BusinessLineMemberDto {
  constructor(readonly userId: string, readonly name: string, readonly email: string, readonly organizationRole: string) {}
}

export class BusinessLineMembersDto {
  constructor(readonly data: BusinessLineMemberDto[]) {}
}

export class BusinessLineCreateCommandDto {
  constructor(readonly organizationId: string, readonly actorUserId: string, readonly input: CreateBusinessLineDto, readonly correlationId: string | null, readonly isPlatformOrganizationContext: boolean) {}
}

export class BusinessLineMembersCommandDto {
  constructor(readonly organizationId: string, readonly actorUserId: string, readonly businessLineId: string, readonly memberUserIds: string[], readonly correlationId: string | null) {}
}
export class BusinessLineUpdateCommandDto {
  constructor(readonly organizationId: string, readonly actorUserId: string, readonly businessLineId: string, readonly input: UpdateBusinessLineDto, readonly correlationId: string | null) {}
}
