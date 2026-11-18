import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { database } from '../db';
import { organization, user } from '../db/auth-schema';
import { PLATFORM_ROLE } from '../auth/authorization.constants';

@Injectable()
export class TenantAccessRepository {
  async isSuperAdminForExistingOrganization(userId: string, organizationId: string): Promise<boolean> {
    const [account, selectedOrganization] = await Promise.all([
      database.select({ platformRole: user.platformRole }).from(user).where(eq(user.id, userId)).limit(1),
      database.select({ id: organization.id }).from(organization).where(eq(organization.id, organizationId)).limit(1),
    ]);
    return account[0]?.platformRole === PLATFORM_ROLE.superAdmin && Boolean(selectedOrganization[0]);
  }
}
