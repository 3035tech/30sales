import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { database } from '../db';
import { activities, auditEvents, opportunities } from '../db/schema';
import { user } from '../db/auth-schema';
import { ActivityRecordDto, ActivityRepositoryCreateDto, ActivityRepositoryListDto } from './activities.dto';

@Injectable()
export class OpportunityActivitiesRepository {
  async list(input: ActivityRepositoryListDto): Promise<ActivityRecordDto[]> {
    const rows = await database.select({ id: activities.id, type: activities.type, subject: activities.subject, details: activities.details, result: activities.result, occurredAt: activities.occurredAt, actorName: user.name, createdAt: activities.createdAt })
      .from(activities).innerJoin(opportunities, and(eq(opportunities.id, activities.opportunityId), eq(opportunities.organizationId, activities.organizationId)))
      .innerJoin(user, eq(user.id, activities.createdByUserId))
      .where(and(eq(activities.organizationId, input.organizationId), eq(activities.opportunityId, input.opportunityId)))
      .orderBy(desc(activities.occurredAt), desc(activities.createdAt)).limit(100);
    return rows.map((row) => new ActivityRecordDto(row.id, row.type, row.subject, row.details, row.result, row.occurredAt.toISOString(), row.actorName, row.createdAt.toISOString()));
  }

  async create(input: ActivityRepositoryCreateDto): Promise<ActivityRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [opportunity] = await transaction.select({ ownerUserId: opportunities.ownerUserId }).from(opportunities)
        .where(and(eq(opportunities.id, input.opportunityId), eq(opportunities.organizationId, input.organizationId))).for('update').limit(1);
      if (!opportunity || (!input.canManageAll && opportunity.ownerUserId !== input.actorUserId)) return null;
      const [activity] = await transaction.insert(activities).values({
        organizationId: input.organizationId,
        opportunityId: input.opportunityId,
        type: input.input.type,
        subject: input.input.subject,
        details: input.input.details || null,
        result: input.input.result || null,
        occurredAt: new Date(input.input.occurredAt),
        createdByUserId: input.actorUserId,
      }).returning();
      await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.actorUserId, actorType: 'user', action: 'activity.created', entityType: 'activity', entityId: activity.id, correlationId: input.correlationId, afterState: { type: activity.type } });
      const [row] = await transaction.select({ actorName: user.name }).from(user).where(eq(user.id, input.actorUserId)).limit(1);
      return new ActivityRecordDto(activity.id, activity.type, activity.subject, activity.details, activity.result, activity.occurredAt.toISOString(), row.actorName, activity.createdAt.toISOString());
    });
  }
}
