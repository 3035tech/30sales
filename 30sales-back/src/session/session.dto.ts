import type { PlatformRole } from '../auth/authorization.constants';
import { z } from 'zod';

export const invitationPreviewIdSchema = z.string().uuid();
export const invitationPreviewOrganizationIdSchema = z.string().uuid().optional();

export class SessionUserDto {
  constructor(readonly id: string, readonly name: string, readonly email: string, readonly platformRole: PlatformRole) {}
}
export class SessionOrganizationDto {
  constructor(readonly id: string, readonly name: string, readonly slug: string) {}
}
export class SessionResponseDto {
  constructor(readonly user: SessionUserDto, readonly activeOrganizationId: string | null, readonly activeOrganizationRole: string | null, readonly organizations: SessionOrganizationDto[], readonly platformOrganizationContext: boolean, readonly platformOrganization: SessionOrganizationDto | null) {}
}
export class InvitationPreviewDto {
  constructor(readonly id: string, readonly emailHint: string, readonly role: string, readonly organization: { readonly name: string }) {}
}
