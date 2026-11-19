export const PLATFORM_ROLE = {
  user: 'user',
  superAdmin: 'super_admin',
} as const;
export const PLATFORM_ROLE_NAMES = [PLATFORM_ROLE.user, PLATFORM_ROLE.superAdmin] as const;
export type PlatformRole = (typeof PLATFORM_ROLE_NAMES)[number];

export const ORGANIZATION_ROLE = {
  owner: 'owner',
  admin: 'admin',
  manager: 'manager',
  bdr: 'bdr',
  sdr: 'sdr',
  closer: 'closer',
  operations: 'operations',
  analyst: 'analyst',
} as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLE)[keyof typeof ORGANIZATION_ROLE];
export function hasOrganizationRole(role: string, expectedRoles: readonly OrganizationRole[]): boolean {
  const activeRoles = role.split(',').map((value) => value.trim());
  return expectedRoles.some((expectedRole) => activeRoles.includes(expectedRole));
}
export const ORGANIZATION_MANAGEMENT_ROLES = [ORGANIZATION_ROLE.owner, ORGANIZATION_ROLE.admin, ORGANIZATION_ROLE.manager] as const;
export const ORGANIZATION_CLOSER_ROLES = [ORGANIZATION_ROLE.closer] as const;
export const ORGANIZATION_CONVERSATION_ASSIGNEE_ROLES = [...ORGANIZATION_MANAGEMENT_ROLES, ORGANIZATION_ROLE.bdr, ORGANIZATION_ROLE.sdr, ORGANIZATION_ROLE.closer] as const;
export const ORGANIZATION_REPORT_ROLES = [...ORGANIZATION_MANAGEMENT_ROLES, ORGANIZATION_ROLE.analyst] as const;

export const AUTH_INVITATION_STATUS = { pending: 'pending' } as const;
export const PLATFORM_OWNER_INVITATION_VALIDITY_DAYS = 7;
export const PLATFORM_ADMIN_PROMOTION_CONFIRMATION = 'PROMOTE_VERIFIED_PLATFORM_ADMIN';
export const PLATFORM_ADMIN_PROMOTION_FAILURE = 'Unable to promote the platform administrator.';
export const PLATFORM_ADMIN_ACCOUNT_MISSING = 'The account does not exist; create and verify it through the normal invitation flow first.';
export const PLATFORM_ADMIN_EMAIL_UNVERIFIED = 'The platform administrator account must have a verified email.';
export const PLATFORM_INVITATION_PATH = '/accept-invitation';
export const PLATFORM_ORGANIZATION_API_PATH = '/api/v1/platform/organizations';
export const BUSINESS_LINES_API_PATH = '/api/v1/business-lines';
export const PLATFORM_ORGANIZATION_CONTEXT_HEADER = 'x-platform-organization-id';
export const PLATFORM_ORGANIZATION_SLUG_UNIQUE_VIOLATION = '23505';
export const PLATFORM_ERROR_CODE = {
  authRequired: 'AUTH_REQUIRED',
  superAdminRequired: 'PLATFORM_ADMIN_REQUIRED',
  organizationSlugAlreadyExists: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
  organizationNotFound: 'PLATFORM_ORGANIZATION_NOT_FOUND',
} as const;
export const PLATFORM_AUDIT_ACTION = {
  organizationCreated: 'organization.created',
  invitationCreated: 'invitation.created',
  organizationAccessed: 'organization.accessed',
  evolutionConfigurationUpdated: 'integration.evolution.configuration_updated',
} as const;
export const PLATFORM_AUDIT_ENTITY_TYPE = {
  organization: 'organization',
  invitation: 'invitation',
  platformAccess: 'platform_access',
  platformIntegration: 'platform_integration',
} as const;
export const AUDIT_ACTOR_TYPE = { user: 'user', system: 'system' } as const;
