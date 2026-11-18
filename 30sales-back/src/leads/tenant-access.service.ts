import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantContextDto } from './leads.dto';
import { toWebHeaders } from '../common/http-headers';
import { PLATFORM_ORGANIZATION_CONTEXT_HEADER } from '../auth/authorization.constants';
import { z } from 'zod';
import { TenantAccessRepository } from './tenant-access.repository';
export type TenantPermission = 'read' | 'create' | 'update' | 'assign' | 'manage';
export type AccessDomain = 'leads' | 'pipeline' | 'activities' | 'inbox' | 'audit' | 'integrations' | 'reports';
const onePermission = <Permission extends string>(permission: Permission): Permission[] => [permission];
@Injectable()
export class TenantAccessService {
  constructor(private readonly repository: TenantAccessRepository) {}

  async require(request: ApiRequestDto, permission: TenantPermission, domain: AccessDomain = 'leads'): Promise<TenantContextDto> {
    if (domain === 'integrations' && permission !== 'read' && permission !== 'manage') throw new ForbiddenException({ code: 'INVALID_PERMISSION_DOMAIN', message: 'The requested permission is not supported for integrations.' });
    if (domain !== 'integrations' && permission === 'manage') throw new ForbiddenException({ code: 'INVALID_PERMISSION_DOMAIN', message: 'The requested permission is not supported for this domain.' });
    const requestHeaders = toWebHeaders(request.headers);
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to access leads.' });
    const platformOrganizationId = request.headers[PLATFORM_ORGANIZATION_CONTEXT_HEADER];
    const requestedPlatformOrganizationId = Array.isArray(platformOrganizationId) ? platformOrganizationId[0] : platformOrganizationId;
    if (requestedPlatformOrganizationId) {
      if (!z.string().uuid().safeParse(requestedPlatformOrganizationId).success) throw new ForbiddenException({ code: 'PLATFORM_CONTEXT_INVALID', message: 'The selected company context is unavailable.' });
      if (!await this.repository.isSuperAdminForExistingOrganization(session.user.id, requestedPlatformOrganizationId)) throw new ForbiddenException({ code: 'PLATFORM_CONTEXT_INVALID', message: 'The selected company context is unavailable.' });
      return new TenantContextDto(session.user.id, requestedPlatformOrganizationId, 'owner');
    }
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) throw new ForbiddenException({ code: 'TENANT_REQUIRED', message: 'Select an organization to continue.' });
    if (domain !== 'leads' && domain !== 'inbox' && permission === 'assign') throw new ForbiddenException({ code: 'INVALID_PERMISSION_DOMAIN', message: 'Assignment permission is only supported for leads and inbox conversations.' });
    const regularPermission: 'read' | 'create' | 'update' = permission === 'manage' ? 'read' : permission === 'assign' ? 'read' : permission;
    const permissionDefinition = domain === 'reports' ? { reports: onePermission(permission === 'read' ? 'read' : 'export') }
      : domain === 'inbox' ? { inbox: onePermission(permission === 'assign' ? 'assign' : 'read') }
      : domain === 'audit' ? { audit: onePermission('read') }
        : domain === 'integrations' ? { integrations: onePermission(permission === 'manage' ? 'manage' : 'read') }
          : domain === 'leads' ? { leads: onePermission(permission === 'assign' ? 'assign' : regularPermission) }
            : domain === 'pipeline' ? { pipeline: onePermission(regularPermission) }
              : { activities: onePermission(regularPermission) };
    const permissionCheck = auth.api.hasPermission({ headers: requestHeaders, body: { permissions: permissionDefinition } });
    const [membership, authorization] = await Promise.all([auth.api.getActiveMemberRole({ headers: requestHeaders }), permissionCheck]);
    if (!membership?.role) throw new ForbiddenException({ code: 'MEMBERSHIP_REQUIRED', message: 'The current user is not a member of the active organization.' });
    if (!authorization.success) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'The current user cannot perform this action.' });
    return new TenantContextDto(session.user.id, organizationId, membership.role);
  }
}
