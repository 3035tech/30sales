import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantContextDto } from './leads.dto';
import { toWebHeaders } from '../common/http-headers';
export type LeadPermission = 'read' | 'create' | 'update';
@Injectable()
export class TenantAccessService {
  async require(request: ApiRequestDto, permission: LeadPermission): Promise<TenantContextDto> {
    const requestHeaders = toWebHeaders(request.headers);
    const session = await auth.api.getSession({ headers: requestHeaders });
    if (!session) throw new UnauthorizedException({ code: 'AUTH_REQUIRED', message: 'Sign in to access leads.' });
    const organizationId = session.session.activeOrganizationId;
    if (!organizationId) throw new ForbiddenException({ code: 'TENANT_REQUIRED', message: 'Select an organization to continue.' });
    const [membership, authorization] = await Promise.all([auth.api.getActiveMemberRole({ headers: requestHeaders }), auth.api.hasPermission({ headers: requestHeaders, body: { permissions: { leads: [permission] } } })]);
    if (!membership?.role) throw new ForbiddenException({ code: 'MEMBERSHIP_REQUIRED', message: 'The current user is not a member of the active organization.' });
    if (!authorization.success) throw new ForbiddenException({ code: 'PERMISSION_DENIED', message: 'The current user cannot perform this action.' });
    return new TenantContextDto(session.user.id, organizationId, membership.role);
  }
}
