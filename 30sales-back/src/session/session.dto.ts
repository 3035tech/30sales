import type { PlatformRole } from '../auth/authorization.constants';

export class SessionUserDto {
  constructor(readonly id: string, readonly name: string, readonly email: string, readonly platformRole: PlatformRole) {}
}
export class SessionOrganizationDto {
  constructor(readonly id: string, readonly name: string, readonly slug: string) {}
}
export class SessionResponseDto {
  constructor(readonly user: SessionUserDto, readonly activeOrganizationId: string | null, readonly activeOrganizationRole: string | null, readonly organizations: SessionOrganizationDto[], readonly platformOrganizationContext: boolean, readonly platformOrganization: SessionOrganizationDto | null) {}
}
