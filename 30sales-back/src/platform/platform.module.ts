import { Module } from '@nestjs/common';
import { PlatformAiUsageController, PlatformController } from './platform.controller';
import { PlatformRepository } from './platform.repository';
import { PlatformService } from './platform.service';
import { ChannelsModule } from '../channels/channels.module';

@Module({ imports: [ChannelsModule], controllers: [PlatformController, PlatformAiUsageController], providers: [PlatformService, PlatformRepository] })
export class PlatformModule {}
