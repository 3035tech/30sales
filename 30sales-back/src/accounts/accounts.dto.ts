import { z } from 'zod';
import { LEAD_STATUSES, UNASSIGNED_SEGMENT_FILTER } from '../leads/constants';
import { ACCOUNT_MARKET_SEGMENTS, QUERY_BOOLEAN_VALUES } from './accounts.constants';

export const createAccountSegmentSchema = z.object({ name: z.string().trim().min(2).max(80) }).strict();
export type CreateAccountSegmentDto = z.infer<typeof createAccountSegmentSchema>;
export const assignAccountSegmentSchema = z.object({ segmentId: z.string().uuid().nullable() }).strict();
export type AssignAccountSegmentDto = z.infer<typeof assignAccountSegmentSchema>;
export const updateAccountProfileSchema = z.object({ marketSegment: z.enum(ACCOUNT_MARKET_SEGMENTS).nullable(), studentCount: z.number().int().nonnegative().nullable() }).strict();
export type UpdateAccountProfileDto = z.infer<typeof updateAccountProfileSchema>;
export const accountIdSchema = z.string().uuid();
export const ACCOUNT_SEGMENT_RESULT = { exists: 'segment_exists', accountNotFound: 'account_not_found', segmentNotFound: 'segment_not_found' } as const;
export const DATABASE_UNIQUE_VIOLATION_CODE = '23505';
export const ACCOUNT_SEGMENT_ERROR_CODE = { exists: 'ACCOUNT_SEGMENT_ALREADY_EXISTS', restricted: 'ACCOUNT_SEGMENT_MANAGEMENT_RESTRICTED', notFound: 'ACCOUNT_SEGMENT_NOT_FOUND', accountNotFound: 'ACCOUNT_NOT_FOUND' } as const;
export const ACCOUNT_SEGMENT_AUDIT = { created: 'account.segment_created', changed: 'account.segment_changed', segmentEntity: 'account_segment', accountEntity: 'account' } as const;
export class AccountSegmentDto { constructor(readonly id: string, readonly name: string) {} }
export class AccountSegmentRepositoryCreateDto { constructor(readonly organizationId: string, readonly actorUserId: string, readonly name: string, readonly correlationId: string | null) {} }
export class AccountSegmentRepositoryAssignDto { constructor(readonly organizationId: string, readonly accountId: string, readonly segmentId: string | null, readonly actorUserId: string, readonly correlationId: string | null) {} }
export class AccountProfileRepositoryUpdateDto { constructor(readonly organizationId: string, readonly accountId: string, readonly userId: string, readonly canManageAll: boolean, readonly includeOwnedOpportunities: boolean, readonly marketSegment: UpdateAccountProfileDto['marketSegment'], readonly studentCount: number | null, readonly correlationId: string | null) {} }

export const listAccountsSchema = z.object({
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
  constructor(readonly id: string, readonly name: string, readonly segmentId: string | null, readonly segmentName: string | null, readonly marketSegment: (typeof ACCOUNT_MARKET_SEGMENTS)[number] | null, readonly studentCount: number | null, readonly contactCount: number, readonly leadCount: number, readonly respondedCount: number, readonly opportunityCount: number, readonly latestActivityAt: string | null) {}
}
export class AccountPageDto {
  constructor(readonly data: AccountRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {}
}
