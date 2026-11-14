import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantContextDto } from './leads.dto';
import { toWebHeaders } from '../common/http-headers';
export type TenantPermission = 'read' | 'create' | 'update' | 'assign' | 'manage';
export type AccessDomain = 'leads' | 'pipeline' | 'activities' | 'inbox' | 'audit' | 'integrations' | 'reports';
@Injectable()
export class TenantAccessService {
  async require(request: ApiRequestDto, permission: TenantPermission, domain: AccessDomain = 'leads'): Promise<TenantContextDto> {
    if (domain === 'integrations' && permission !== 'read' && permission !== 'manage') throw new ForbiddenException({ code: 'INVALID_PERMISSION_DOMAIN', message: 'The requested permission is not supported for integrations.' });
    if (domain !== 'integrations' && permission === 'manage') throw new ForbiddenException({ code: 'INVALID_PERMISSION_DOMAIN', message: 'The requested permission is not supported for this domain.' });
    const requestHeaders = toWebHeaders(request.headers);
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to access leads.' });
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) throw new ForbiddenException({ code: 'TENANT_REQUIRED', message: 'Select an organization to continue.' });
    if (domain !== 'leads' && domain !== 'inbox' && permission === 'assign') throw new ForbiddenException({ code: 'INVALID_PERMISSION_DOMAIN', message: 'Assignment permission is only supported for leads and inbox conversations.' });
    const regularPermission: 'read' | 'create' | 'update' = permission === 'manage' ? 'read' : permission === 'assign' ? 'read' : permission;
    const permissionDefinition = domain === 'reports' ? { reports: permission === 'read' ? ['read'] as Array<'read'> : ['export'] as Array<'export'> }
      : domain === 'inbox' ? { inbox: permission === 'assign' ? ['assign'] as Array<'assign'> : ['read'] as Array<'read'> }
      : domain === 'audit' ? { audit: ['read'] as Array<'read'> }
        : domain === 'integrations' ? { integrations: permission === 'manage' ? ['manage'] as Array<'manage'> : ['read'] as Array<'read'> }
          : domain === 'leads' ? { leads: permission === 'assign' ? ['assign'] as Array<'assign'> : [regularPermission] }
            : domain === 'pipeline' ? { pipeline: [regularPermission] }
              : { activities: [regularPermission] };
    const permissionCheck = auth.api.hasPermission({ headers: requestHeaders, body: { permissions: permissionDefinition } });
    const [membership, authorization] = await Promise.all([auth.api.getActiveMemberRole({ headers: requestHeaders }), permissionCheck]);
    if (!membership?.role) throw new ForbiddenException({ code: 'MEMBERSHIP_REQUIRED', message: 'The current user is not a member of the active organization.' });
    if (!authorization.success) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'The current user cannot perform this action.' });
    return new TenantContextDto(session.user.id, organizationId, membership.role);
  }
}
