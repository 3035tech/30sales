import { Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { database } from '../db';
import { member, user } from '../db/auth-schema';
import { and, eq } from 'drizzle-orm';
import { ApiRequestDto } from '../common/api-request.dto';
import { toWebHeaders } from '../common/http-headers';
import { SessionOrganizationDto, SessionResponseDto, SessionUserDto } from './session.dto';
@Injectable()
export class SessionService {
  async getCurrent(request: ApiRequestDto): Promise<SessionResponseDto> {
    const headers = toWebHeaders(request.headers);
    const session = await auth.api.getSession({ headers });
    if (!session) throw new UnauthorizedException();
    const [userRecord] = await database.select({ platformRole: user.platformRole }).from(user).where(eq(user.id, session.user.id)).limit(1);
    if (!userRecord) throw new UnauthorizedException();
    const activeOrganizationId = session.session.activeOrganizationId ?? null;
    const [activeMembership] = activeOrganizationId ? await database.select({ role: member.role }).from(member).where(and(eq(member.userId, session.user.id), eq(member.organizationId, activeOrganizationId))).limit(1) : [];
    // Platform admins may also belong to customer workspaces. Return only memberships
    // Better Auth confirms for this user; the platform API remains separately scoped.
    const organizations = await auth.api.listOrganizations({ headers });
    return new SessionResponseDto(
      new SessionUserDto(session.user.id, session.user.name, session.user.email, userRecord.platformRole),
      activeOrganizationId,
      activeMembership?.role ?? null,
      organizations.map((organization) => new SessionOrganizationDto(organization.id, organization.name, organization.slug)),
    );
  }
}
