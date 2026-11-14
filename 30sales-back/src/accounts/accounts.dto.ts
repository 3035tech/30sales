import { z } from 'zod';
import { LEAD_STATUSES } from '../leads/constants';

export const listAccountsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  leadStatus: z.enum(LEAD_STATUSES).optional(),
  sortBy: z.enum(['accountName', 'contactCount', 'leadCount', 'respondedCount', 'opportunityCount', 'latestActivityAt']).default('latestActivityAt'),
  sortDirection: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
}).strict();
export type ListAccountsQueryDto = z.infer<typeof listAccountsSchema>;

export class AccountsRepositoryListDto {
  constructor(readonly organizationId: string, readonly query: ListAccountsQueryDto) {}
}
export class AccountRecordDto {
  constructor(readonly id: string, readonly name: string, readonly contactCount: number, readonly leadCount: number, readonly respondedCount: number, readonly opportunityCount: number, readonly latestActivityAt: string | null) {}
}
export class AccountPageDto {
  constructor(readonly data: AccountRecordDto[], readonly pagination: { readonly limit: number; readonly offset: number; readonly total: number; readonly hasNextPage: boolean }) {}
}
