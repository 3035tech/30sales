import { Module } from '@nestjs/common';
import { HandoffsController } from './handoffs.controller';
import { HandoffsRepository } from './handoffs.repository';
import { HandoffsService } from './handoffs.service';

@Module({ controllers: [HandoffsController], providers: [HandoffsService, HandoffsRepository] })
export class HandoffsModule {}
