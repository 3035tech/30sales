import { Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { ApiRequestDto } from '../common/api-request.dto';
import { toWebHeaders } from '../common/http-headers';
import { SessionOrganizationDto, SessionResponseDto, SessionUserDto } from './session.dto';
import { PLATFORM_ORGANIZATION_CONTEXT_HEADER, PLATFORM_ROLE } from '../auth/authorization.constants';
import { z } from 'zod';
import { SessionRepository } from './session.repository';
@Injectable()
export class SessionService {
  constructor(private readonly repository: SessionRepository) {}

  async getCurrent(request: ApiRequestDto): Promise<SessionResponseDto> {
    const headers = toWebHeaders(request.headers);
    const session = await auth.api.getSession({ headers });
    if (!session) throw new UnauthorizedException();
    const userRecord = await this.repository.findUserPlatformRole(session.user.id);
    if (!userRecord) throw new UnauthorizedException();
    const contextHeader = request.headers[PLATFORM_ORGANIZATION_CONTEXT_HEADER];
    const requestedPlatformOrganizationId = Array.isArray(contextHeader) ? contextHeader[0] : contextHeader;
    const validPlatformOrganizationId = requestedPlatformOrganizationId && z.string().uuid().safeParse(requestedPlatformOrganizationId).success ? requestedPlatformOrganizationId : null;
    const platformOrganization = userRecord.platformRole === PLATFORM_ROLE.superAdmin && validPlatformOrganizationId
      ? await this.repository.findOrganization(validPlatformOrganizationId)
      : null;
    const platformOrganizationContext = Boolean(platformOrganization);
    const activeOrganizationId = platformOrganization?.id ?? session.session.activeOrganizationId ?? null;
    const activeMembershipRole = activeOrganizationId && !platformOrganizationContext ? await this.repository.findMembershipRole(session.user.id, activeOrganizationId) : null;
    // Platform admins may also belong to customer workspaces. Return only memberships
    // Better Auth confirms for this user; the platform API remains separately scoped.
    const memberOrganizations = await auth.api.listOrganizations({ headers });
    const organizations = memberOrganizations.map((item) => new SessionOrganizationDto(item.id, item.name, item.slug));
    return new SessionResponseDto(
      new SessionUserDto(session.user.id, session.user.name, session.user.email, userRecord.platformRole),
      activeOrganizationId,
      platformOrganizationContext ? 'owner' : activeMembershipRole,
      organizations,
      platformOrganizationContext,
      platformOrganization ? new SessionOrganizationDto(platformOrganization.id, platformOrganization.name, platformOrganization.slug) : null,
    );
  }
}
