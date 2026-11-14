import { Module } from '@nestjs/common';
import { TenantAccessService } from '../leads/tenant-access.service';
import { ChannelsController } from './channels.controller';
import { ChannelsRepository } from './channels.repository';
import { ChannelsService } from './channels.service';

@Module({ controllers: [ChannelsController], providers: [ChannelsService, ChannelsRepository, TenantAccessService] })
export class ChannelsModule {}
