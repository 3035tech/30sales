import { Injectable } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { AccountPageDto, AccountsRepositoryListDto, ListAccountsQueryDto } from './accounts.dto';
import { AccountsRepository } from './accounts.repository';

@Injectable()
export class AccountsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: AccountsRepository) {}
  async list(request: ApiRequestDto, query: ListAccountsQueryDto): Promise<AccountPageDto> {
    const context = await this.tenantAccess.require(request, 'read', 'leads');
    return this.repository.list(new AccountsRepositoryListDto(context.organizationId, query));
  }
}
