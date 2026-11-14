import { Controller, Get, Query } from '@nestjs/common';
import { ApiRequest } from '../common/api-request.decorator';
import { ApiRequestDto } from '../common/api-request.dto';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { listAccountsSchema } from './accounts.dto';
import type { ListAccountsQueryDto } from './accounts.dto';
import { AccountsService } from './accounts.service';

@Controller('api/v1/accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}
  @Get('table')
  list(@ApiRequest() request: ApiRequestDto, @Query(new ZodValidationPipe(listAccountsSchema)) query: ListAccountsQueryDto) {
    return this.accountsService.list(request, query);
  }
}
