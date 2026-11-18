import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { database } from '../db';
import { member, organization, user } from '../db/auth-schema';

@Injectable()
export class SessionRepository {
  async findUserPlatformRole(userId: string) {
    const [record] = await database.select({ platformRole: user.platformRole }).from(user).where(eq(user.id, userId)).limit(1);
    return record ?? null;
  }

  async findOrganization(organizationId: string) {
    const [record] = await database.select({ id: organization.id, name: organization.name, slug: organization.slug })
      .from(organization).where(eq(organization.id, organizationId)).limit(1);
    return record ?? null;
  }

  async findMembershipRole(userId: string, organizationId: string) {
    const [record] = await database.select({ role: member.role }).from(member)
      .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId))).limit(1);
    return record?.role ?? null;
  }
}
