import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { PLATFORM_ERROR_CODE, PLATFORM_INVITATION_PATH, PLATFORM_ROLE } from '../auth/authorization.constants';
import { ApiRequestDto } from '../common/api-request.dto';
import { toWebHeaders } from '../common/http-headers';
import { database } from '../db';
import { user } from '../db/auth-schema';
import { eq } from 'drizzle-orm';
import { sendInvitationEmail } from '../email/templates';
import { env } from '../config/env';
import { PlatformContextDto, PlatformOrganizationAccessResultDto, PlatformOrganizationCreateResultDto, PlatformOrganizationListDto, type CreatePlatformOrganizationDto, type ListPlatformOrganizationsQueryDto } from './platform.dto';
import { PlatformRepository } from './platform.repository';

@Injectable()
export class PlatformService {
  constructor(private readonly repository: PlatformRepository) {}

  private async requireSuperAdmin(request: ApiRequestDto): Promise<PlatformContextDto> {
    const session = await auth.api.getSession({ headers: toWebHeaders(request.headers) });
    if (!session) throw new UnauthorizedException({ code: PLATFORM_ERROR_CODE.authRequired });
    const [account] = await database.select({ platformRole: user.platformRole }).from(user).where(eq(user.id, session.user.id)).limit(1);
    if (account?.platformRole !== PLATFORM_ROLE.superAdmin) throw new ForbiddenException({ code: PLATFORM_ERROR_CODE.superAdminRequired });
    return new PlatformContextDto(session.user.id, session.user.name, session.user.email);
  }

  async listOrganizations(request: ApiRequestDto, query: ListPlatformOrganizationsQueryDto): Promise<PlatformOrganizationListDto> {
    await this.requireSuperAdmin(request);
    return this.repository.listOrganizations(query);
  }

  async accessOrganization(request: ApiRequestDto, organizationId: string): Promise<PlatformOrganizationAccessResultDto> {
    const actor = await this.requireSuperAdmin(request);
    const recorded = await this.repository.recordOrganizationAccess(organizationId, actor, request.correlationId);
    if (!recorded) throw new NotFoundException({ code: PLATFORM_ERROR_CODE.organizationNotFound });
    return new PlatformOrganizationAccessResultDto(organizationId, true);
  }

  async createOrganization(request: ApiRequestDto, input: CreatePlatformOrganizationDto): Promise<PlatformOrganizationCreateResultDto> {
    const actor = await this.requireSuperAdmin(request);
    const result = await this.repository.createOrganization(input, actor, request.correlationId);
    if (!result) throw new ConflictException({ code: PLATFORM_ERROR_CODE.organizationSlugAlreadyExists });
    const invitationUrl = new URL(PLATFORM_INVITATION_PATH, env.FRONTEND_URL);
    invitationUrl.searchParams.set('id', result.invitationId);
    let emailSent = false;
    try {
      await sendInvitationEmail({ id: result.invitationId, email: input.ownerEmail.toLowerCase(), inviter: { user: { name: actor.name, email: actor.email } }, organization: { name: result.organization.name } });
      emailSent = true;
    } catch {
      emailSent = false;
    }
    return new PlatformOrganizationCreateResultDto(result.organization, { email: input.ownerEmail.toLowerCase(), invitationUrl: invitationUrl.toString(), emailSent });
  }
}
