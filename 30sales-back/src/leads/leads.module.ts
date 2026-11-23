import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsRepository } from './leads.repository';
import { LeadsService } from './leads.service';
import { AssistantLanguageModelService } from '../agents/assistant-language-model.service';
@Module({ controllers: [LeadsController], providers: [LeadsService, LeadsRepository, AssistantLanguageModelService] })
export class LeadsModule {}
