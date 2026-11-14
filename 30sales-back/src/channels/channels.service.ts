import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ChannelRecordDto, ChannelRepositoryCreateDto, ChannelRepositoryUpdateDto, CreateChannelDto, UpdateChannelDto } from './channels.dto';
import { ChannelsRepository } from './channels.repository';

@Injectable()
export class ChannelsService {
  constructor(private readonly tenantAccess: TenantAccessService, private readonly repository: ChannelsRepository) {}
  async list(request: ApiRequestDto): Promise<ChannelRecordDto[]> {
    const context = await this.tenantAccess.require(request, 'read', 'integrations');
    return this.repository.list(context.organizationId);
  }
  async create(request: ApiRequestDto, input: CreateChannelDto): Promise<ChannelRecordDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const result = await this.repository.create(new ChannelRepositoryCreateDto(context.organizationId, context.userId, input, request.correlationId));
    if (result === 'duplicate') throw new ConflictException({ code: 'CHANNEL_ALREADY_CONFIGURED', message: 'The phone number or provider channel is already configured in this organization.' });
    return result;
  }
  async update(request: ApiRequestDto, channelId: string, input: UpdateChannelDto): Promise<ChannelRecordDto> {
    const context = await this.tenantAccess.require(request, 'manage', 'integrations');
    const result = await this.repository.update(new ChannelRepositoryUpdateDto(context.organizationId, channelId, context.userId, input, request.correlationId));
    if (!result) throw new NotFoundException({ code: 'CHANNEL_NOT_FOUND', message: 'The channel was not found in the active organization.' });
    return result;
  }
}
