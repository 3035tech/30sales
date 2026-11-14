import { Injectable, UnauthorizedException } from '@nestjs/common';
import { auth } from '../auth/auth';
import { ApiRequestDto } from '../common/api-request.dto';
import { toWebHeaders } from '../common/http-headers';
import { SessionOrganizationDto, SessionResponseDto, SessionUserDto } from './session.dto';
@Injectable()
export class SessionService {
  async getCurrent(request: ApiRequestDto): Promise<SessionResponseDto> {
    const headers = toWebHeaders(request.headers);
    const session = await auth.api.getSession({ headers });
    if (!session) throw new UnauthorizedException();
    const organizations = await auth.api.listOrganizations({ headers });
    return new SessionResponseDto(
      new SessionUserDto(session.user.id, session.user.name, session.user.email),
      session.session.activeOrganizationId ?? null,
      organizations.map((organization) => new SessionOrganizationDto(organization.id, organization.name, organization.slug)),
    );
  }
}
