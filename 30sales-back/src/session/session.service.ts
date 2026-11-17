import { Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { database } from '../db';
import { member, organization, user } from '../db/auth-schema';
import { and, eq } from 'drizzle-orm';
import { ApiRequestDto } from '../common/api-request.dto';
import { toWebHeaders } from '../common/http-headers';
import { SessionOrganizationDto, SessionResponseDto, SessionUserDto } from './session.dto';
import { PLATFORM_ORGANIZATION_CONTEXT_HEADER, PLATFORM_ROLE } from '../auth/authorization.constants';
import { z } from 'zod';
@Injectable()
export class SessionService {
  async getCurrent(request: ApiRequestDto): Promise<SessionResponseDto> {
    const headers = toWebHeaders(request.headers);
    const session = await auth.api.getSession({ headers });
    if (!session) throw new UnauthorizedException();
    const [userRecord] = await database.select({ platformRole: user.platformRole }).from(user).where(eq(user.id, session.user.id)).limit(1);
    if (!userRecord) throw new UnauthorizedException();
    const contextHeader = request.headers[PLATFORM_ORGANIZATION_CONTEXT_HEADER];
    const requestedPlatformOrganizationId = Array.isArray(contextHeader) ? contextHeader[0] : contextHeader;
    const validPlatformOrganizationId = requestedPlatformOrganizationId && z.string().uuid().safeParse(requestedPlatformOrganizationId).success ? requestedPlatformOrganizationId : null;
    const [platformOrganization] = userRecord.platformRole === PLATFORM_ROLE.superAdmin && validPlatformOrganizationId
      ? await database.select({ id: organization.id, name: organization.name, slug: organization.slug }).from(organization).where(eq(organization.id, validPlatformOrganizationId)).limit(1)
      : [];
    const platformOrganizationContext = Boolean(platformOrganization);
    const activeOrganizationId = platformOrganization?.id ?? session.session.activeOrganizationId ?? null;
    const [activeMembership] = activeOrganizationId && !platformOrganizationContext ? await database.select({ role: member.role }).from(member).where(and(eq(member.userId, session.user.id), eq(member.organizationId, activeOrganizationId))).limit(1) : [];
    // Platform admins may also belong to customer workspaces. Return only memberships
    // Better Auth confirms for this user; the platform API remains separately scoped.
    const memberOrganizations = await auth.api.listOrganizations({ headers });
    const organizations = memberOrganizations.map((item) => new SessionOrganizationDto(item.id, item.name, item.slug));
    return new SessionResponseDto(
      new SessionUserDto(session.user.id, session.user.name, session.user.email, userRecord.platformRole),
      activeOrganizationId,
      platformOrganizationContext ? 'owner' : activeMembership?.role ?? null,
      organizations,
      platformOrganizationContext,
      platformOrganization ? new SessionOrganizationDto(platformOrganization.id, platformOrganization.name, platformOrganization.slug) : null,
    );
  }
}
