import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lte, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { database } from '../db';
import { auditEvents } from '../db/schema';
import { user } from '../db/auth-schema';
import { AuditEventRecordDto, AuditEventsPageDto, AuditRepositoryListDto } from './audit.dto';

const auditActor = alias(user, 'audit_actor');
@Injectable()
export class AuditRepository {
  async list(input: AuditRepositoryListDto): Promise<AuditEventsPageDto> {
    const conditions: SQL[] = [eq(auditEvents.organizationId, input.organizationId)];
    if (input.query.action) conditions.push(eq(auditEvents.action, input.query.action));
    if (input.query.entityType) conditions.push(eq(auditEvents.entityType, input.query.entityType));
    if (input.query.entityId) conditions.push(eq(auditEvents.entityId, input.query.entityId));
    if (input.query.from) conditions.push(gte(auditEvents.occurredAt, new Date(input.query.from)));
    if (input.query.to) conditions.push(lte(auditEvents.occurredAt, new Date(input.query.to)));
    const where = and(...conditions);
    const [rows, totals] = await Promise.all([
      database.select({ id: auditEvents.id, actorType: auditEvents.actorType, actorName: auditActor.name, action: auditEvents.action, entityType: auditEvents.entityType, entityId: auditEvents.entityId, reason: auditEvents.reason, beforeState: auditEvents.beforeState, afterState: auditEvents.afterState, occurredAt: auditEvents.occurredAt })
        .from(auditEvents).leftJoin(auditActor, eq(auditActor.id, auditEvents.actorUserId)).where(where)
        .orderBy(desc(auditEvents.occurredAt), desc(auditEvents.id)).limit(input.query.limit).offset(input.query.offset),
      database.select({ total: count() }).from(auditEvents).where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    const data = rows.map((row) => new AuditEventRecordDto(row.id, row.actorType, row.actorName, row.action, row.entityType, row.entityId, row.reason, row.beforeState, row.afterState, row.occurredAt.toISOString()));
    return new AuditEventsPageDto(data, { limit: input.query.limit, offset: input.query.offset, total, hasNextPage: input.query.offset + data.length < total });
  }
}
