import { z } from 'zod';

const organizationSlugSchema = z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const createPlatformOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: organizationSlugSchema,
  ownerEmail: z.string().trim().email().max(254),
}).strict();
export type CreatePlatformOrganizationDto = z.infer<typeof createPlatformOrganizationSchema>;
export const listPlatformOrganizationsSchema = z.object({ search: z.string().trim().max(160).optional(), limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).strict();
export const platformOrganizationIdSchema = z.string().uuid();
export type ListPlatformOrganizationsQueryDto = z.infer<typeof listPlatformOrganizationsSchema>;

export class PlatformContextDto {
  constructor(readonly userId: string, readonly name: string, readonly email: string) {}
}
export class PlatformOrganizationRecordDto {
  constructor(readonly id: string, readonly name: string, readonly slug: string, readonly memberCount: number, readonly createdAt: string) {}
}
export class PlatformOrganizationListDto {
  constructor(readonly data: PlatformOrganizationRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {}
}
export class PlatformOrganizationCreateResultDto {
  constructor(readonly organization: PlatformOrganizationRecordDto, readonly ownerInvitation: { readonly email: string; readonly invitationUrl: string; readonly emailSent: boolean }) {}
}
export class PlatformOrganizationAccessResultDto {
  constructor(readonly organizationId: string, readonly accessRecorded: true) {}
}
