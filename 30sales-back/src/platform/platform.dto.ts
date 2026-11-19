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
export const platformAuditQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10), offset: z.coerce.number().int().min(0).default(0) }).strict();
export type ListPlatformOrganizationsQueryDto = z.infer<typeof listPlatformOrganizationsSchema>;
export type PlatformAuditQueryDto = z.infer<typeof platformAuditQuerySchema>;
export const savePlatformEvolutionConfigurationSchema = z.object({ displayName: z.string().trim().min(2).max(100), baseUrl: z.string().url().max(2048), apiKey: z.string().trim().min(1).max(500) }).strict().superRefine((input, context) => {
  const url = new URL(input.baseUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || ['localhost', '127.0.0.1', '::1'].includes(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) context.addIssue({ code: 'custom', path: ['baseUrl'], message: 'The Evolution API URL must be a secure HTTP(S) origin without credentials, query, or fragment.' });
});
export type SavePlatformEvolutionConfigurationDto = z.infer<typeof savePlatformEvolutionConfigurationSchema>;

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
export class PlatformEvolutionConfigurationDto {
  constructor(readonly configured: boolean, readonly displayName: string | null, readonly baseUrl: string | null, readonly updatedAt: string | null) {}
}
export class PlatformEvolutionConnectionCheckDto {
  constructor(readonly success: true, readonly instanceCount: number, readonly checkedAt: string) {}
}
export class PlatformAuditEventDto {
  constructor(readonly id: string, readonly action: string, readonly actorName: string | null, readonly beforeState: unknown, readonly afterState: unknown, readonly occurredAt: string) {}
}
