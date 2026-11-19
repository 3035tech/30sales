import { Module } from '@nestjs/common';
import { BusinessLinesController } from './business-lines.controller';
import { BusinessLinesRepository } from './business-lines.repository';
import { BusinessLinesService } from './business-lines.service';

@Module({ controllers: [BusinessLinesController], providers: [BusinessLinesService, BusinessLinesRepository] })
export class BusinessLinesModule {}
