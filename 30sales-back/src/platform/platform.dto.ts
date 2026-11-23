import { z } from 'zod';
import { PLATFORM_AI_USAGE } from './platform.constants';
import { PLATFORM_INVITABLE_ORGANIZATION_ROLES } from '../auth/authorization.constants';

const organizationSlugSchema = z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const createPlatformOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: organizationSlugSchema,
  ownerEmail: z.string().trim().email().max(254),
}).strict();
export type CreatePlatformOrganizationDto = z.infer<typeof createPlatformOrganizationSchema>;
export const listPlatformOrganizationsSchema = z.object({ search: z.string().trim().max(160).optional(), limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).strict();
export const platformOrganizationIdSchema = z.string().uuid();
export const createPlatformOrganizationInvitationSchema = z.object({ email: z.string().trim().email().max(254), role: z.enum(PLATFORM_INVITABLE_ORGANIZATION_ROLES) }).strict();
export type CreatePlatformOrganizationInvitationDto = z.infer<typeof createPlatformOrganizationInvitationSchema>;
export const platformAuditQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(10), offset: z.coerce.number().int().min(0).default(0) }).strict();
export const platformAiUsageQuerySchema = z.object({ from: z.string().date(), to: z.string().date(), limit: z.coerce.number().int().min(1).max(PLATFORM_AI_USAGE.maximumPageSize).default(PLATFORM_AI_USAGE.defaultPageSize), offset: z.coerce.number().int().min(PLATFORM_AI_USAGE.defaultPageOffset).default(PLATFORM_AI_USAGE.defaultPageOffset) }).strict().refine((query) => new Date(`${query.from}T00:00:00.000Z`).getTime() <= new Date(`${query.to}T00:00:00.000Z`).getTime(), { message: 'The start date must be before or equal to the end date.', path: ['from'] }).refine((query) => {
  const from = new Date(`${query.from}T00:00:00.000Z`);
  const to = new Date(`${query.to}T00:00:00.000Z`);
  return (to.getTime() - from.getTime()) / PLATFORM_AI_USAGE.millisecondsPerDay < PLATFORM_AI_USAGE.maximumRangeDays;
}, { message: 'The date range cannot exceed one year.', path: ['to'] });
export type ListPlatformOrganizationsQueryDto = z.infer<typeof listPlatformOrganizationsSchema>;
export type PlatformAuditQueryDto = z.infer<typeof platformAuditQuerySchema>;
export type PlatformAiUsageQueryDto = z.infer<typeof platformAiUsageQuerySchema>;
const validatePlatformEvolutionBaseUrl = (baseUrl: string, context: z.RefinementCtx) => {
  const url = new URL(baseUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol) || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash || ['localhost', '127.0.0.1', '::1'].includes(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) context.addIssue({ code: 'custom', path: ['baseUrl'], message: 'The Evolution API URL must be a secure HTTP(S) origin without credentials, query, or fragment.' });
};
export const savePlatformEvolutionConfigurationSchema = z.object({ displayName: z.string().trim().min(2).max(100), baseUrl: z.string().url().max(2048), apiKey: z.string().trim().min(1).max(500) }).strict().superRefine((input, context) => validatePlatformEvolutionBaseUrl(input.baseUrl, context));
export type SavePlatformEvolutionConfigurationDto = z.infer<typeof savePlatformEvolutionConfigurationSchema>;
export const checkPlatformEvolutionConnectionSchema = z.object({ baseUrl: z.string().url().max(2048).optional(), apiKey: z.string().trim().min(1).max(500).optional() }).strict().superRefine((input, context) => {
  if (Boolean(input.baseUrl) !== Boolean(input.apiKey)) context.addIssue({ code: 'custom', path: ['apiKey'], message: 'Provide both the Evolution API URL and API key to test an unsaved connection.' });
  if (input.baseUrl) validatePlatformEvolutionBaseUrl(input.baseUrl, context);
});
export type CheckPlatformEvolutionConnectionDto = z.infer<typeof checkPlatformEvolutionConnectionSchema>;

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
export class PlatformOrganizationMembersDto {
  constructor(readonly members: Array<{ id: string; role: string; user: { id: string; name: string; email: string } }>) {}
}
export class PlatformOrganizationInvitationResultDto {
  constructor(readonly email: string, readonly emailSent: boolean) {}
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

export class PlatformAiUsagePointDto {
  constructor(readonly organizationId: string, readonly organizationName: string, readonly organizationSlug: string, readonly operation: string, readonly model: string, readonly requestCount: number, readonly inputTokens: number, readonly outputTokens: number, readonly estimatedCostUsd: string | null, readonly unpricedRequestCount: number) {}
}
export class PlatformAiUsageDto {
  constructor(readonly from: string, readonly to: string, readonly requestCount: number, readonly inputTokens: number, readonly outputTokens: number, readonly estimatedCostUsd: string | null, readonly unpricedRequestCount: number, readonly points: PlatformAiUsagePointDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }, readonly generatedAt: string) {}
}
