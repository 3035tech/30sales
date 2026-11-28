import { z } from 'zod';
import { LEAD_STATUSES, UNASSIGNED_SEGMENT_FILTER } from '../leads/constants';
import { ACCOUNT_CONTACT_MAX_PAGE_SIZE, ACCOUNT_CONTACT_PAGE_SIZE, ACCOUNT_INDUSTRIES, ACCOUNT_MARKET_SEGMENTS, ACCOUNT_PERSON_STATUSES, QUERY_BOOLEAN_VALUES } from './accounts.constants';

export const createAccountSegmentSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();
export type CreateAccountSegmentDto = z.infer<typeof createAccountSegmentSchema>;
export const assignAccountSegmentSchema = z.object({ segmentId: z.string().uuid().nullable() }).strict();
export type AssignAccountSegmentDto = z.infer<typeof assignAccountSegmentSchema>;
export const updateAccountProfileSchema = z.object({ marketSegment: z.enum(ACCOUNT_MARKET_SEGMENTS).nullable(), studentCount: z.number().int().nonnegative().nullable(), employeeCount: z.number().int().nonnegative().nullable(), industry: z.enum(ACCOUNT_INDUSTRIES).nullable(), legalName: z.string().trim().max(240).nullable(), taxId: z.string().trim().regex(/^(?:\d{14})?$/).nullable(), phone: z.string().trim().max(40).nullable(), address: z.string().trim().max(1000).nullable(), addressLine1: z.string().trim().max(240).nullable().optional(), addressLine2: z.string().trim().max(240).nullable().optional(), addressPostalCode: z.string().trim().max(32).nullable().optional(), addressCity: z.string().trim().max(120).nullable().optional(), addressState: z.string().trim().max(120).nullable().optional(), addressCountry: z.string().trim().max(120).nullable().optional() }).strict();
export type UpdateAccountProfileDto = z.infer<typeof updateAccountProfileSchema>;
export const accountIdSchema = z.string().uuid();
export const listAccountContactsSchema = z.object({ businessLineId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(ACCOUNT_CONTACT_MAX_PAGE_SIZE).default(ACCOUNT_CONTACT_PAGE_SIZE), offset: z.coerce.number().int().nonnegative().default(0) }).strict();
export type ListAccountContactsQueryDto = z.infer<typeof listAccountContactsSchema>;
export class AccountSegmentDto { constructor(readonly id: string, readonly name: string) {} }
export class AccountSegmentRepositoryCreateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly name: string, readonly correlationId: string | null) {} }
export class AccountSegmentRepositoryAssignDto { constructor(readonly organizationId: string, readonly accountId: string, readonly segmentId: string | null, readonly actorUserId: string, readonly correlationId: string | null) {} }
export class AccountProfileRepositoryUpdateDto { constructor(readonly organizationId: string, readonly accountId: string, readonly userId: string, readonly canManageAll: boolean, readonly includeOwnedOpportunities: boolean, readonly input: UpdateAccountProfileDto, readonly correlationId: string | null) {} }
export class AccountContactsRepositoryDto { constructor(readonly organizationId: string, readonly accountId: string, readonly userId: string, readonly canManageAll: boolean, readonly includeOwnedOpportunities: boolean, readonly query: ListAccountContactsQueryDto) {} }
export class AccountContactMutationRepositoryDto extends AccountContactsRepositoryDto { constructor(organizationId: string, accountId: string, userId: string, canManageAll: boolean, includeOwnedOpportunities: boolean, query: ListAccountContactsQueryDto, readonly personId: string, readonly correlationId: string | null) { super(organizationId, accountId, userId, canManageAll, includeOwnedOpportunities, query); } }
export class AccountContactDto { constructor(readonly id: string, readonly name: string, readonly email: string | null, readonly phone: string | null, readonly leadCount: number, readonly status: (typeof ACCOUNT_PERSON_STATUSES)[number]) {} }
export class AccountContactPageDto { constructor(readonly data: AccountContactDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {} }

export const listAccountsSchema = z.object({
  businessLineId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  segmentId: z.union([z.string().uuid(), z.literal(UNASSIGNED_SEGMENT_FILTER)]).optional(),
  marketSegment: z.enum(ACCOUNT_MARKET_SEGMENTS).optional(),
  withoutMarketSegment: z.enum([QUERY_BOOLEAN_VALUES.enabled, QUERY_BOOLEAN_VALUES.disabled]).transform((value) => value === QUERY_BOOLEAN_VALUES.enabled).optional(),
  studentCountMin: z.coerce.number().int().nonnegative().optional(),
  studentCountMax: z.coerce.number().int().nonnegative().optional(),
  sortBy: z.enum(['accountName', 'segment', 'contactCount', 'leadCount', 'respondedCount', 'opportunityCount', 'latestActivityAt']).default('latestActivityAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
}).strict().superRefine((query, context) => {
  if (query.studentCountMin !== undefined && query.studentCountMax !== undefined && query.studentCountMin > query.studentCountMax) context.addIssue({ code: 'custom', path: ['studentCountMax'], message: 'Maximum student count must be greater than or equal to the minimum.' });
});
export type ListAccountsQueryDto = z.infer<typeof listAccountsSchema>;

export class AccountsRepositoryListDto {
  constructor(readonly organizationId: string, readonly userId: string, readonly canManageAll: boolean, readonly includeOwnedOpportunities: boolean, readonly query: ListAccountsQueryDto) {}
}
export class AccountRecordDto {
  constructor(readonly id: string, readonly name: string, readonly segmentId: string | null, readonly segmentName: string | null, readonly marketSegment: (typeof ACCOUNT_MARKET_SEGMENTS)[number] | null, readonly studentCount: number | null, readonly employeeCount: number | null, readonly industry: (typeof ACCOUNT_INDUSTRIES)[number] | null, readonly legalName: string | null, readonly taxId: string | null, readonly phone: string | null, readonly address: string | null, readonly addressLine1: string | null, readonly addressLine2: string | null, readonly addressPostalCode: string | null, readonly addressCity: string | null, readonly addressState: string | null, readonly addressCountry: string | null, readonly contactCount: number, readonly leadCount: number, readonly respondedCount: number, readonly opportunityCount: number, readonly latestActivityAt: string | null) {}
}
export class AccountPageDto {
  constructor(readonly data: AccountRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {}
}
