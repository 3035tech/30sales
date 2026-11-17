export const PLATFORM_ROLE = {
  user: 'user',
  superAdmin: 'super_admin',
} as const;
export const PLATFORM_ROLE_NAMES = [PLATFORM_ROLE.user, PLATFORM_ROLE.superAdmin] as const;
export const ORGANIZATION_ROLE = { owner: 'owner', admin: 'admin', manager: 'manager', bdr: 'bdr', sdr: 'sdr', closer: 'closer', operations: 'operations', analyst: 'analyst' } as const;
export const ORGANIZATION_ROLE_NAMES = Object.values(ORGANIZATION_ROLE);
export const ORGANIZATION_SEGMENT_MANAGEMENT_ROLES = [ORGANIZATION_ROLE.owner, ORGANIZATION_ROLE.admin, ORGANIZATION_ROLE.manager] as const;
export const ORGANIZATION_PROFILE_UPDATE_ROLES = [...ORGANIZATION_SEGMENT_MANAGEMENT_ROLES, ORGANIZATION_ROLE.bdr, ORGANIZATION_ROLE.sdr, ORGANIZATION_ROLE.closer, ORGANIZATION_ROLE.operations] as const;
export type OrganizationRole = (typeof ORGANIZATION_ROLE)[keyof typeof ORGANIZATION_ROLE];
export function getOrganizationRoles(role: string | null | undefined): OrganizationRole[] {
  const assignedRoles = role?.split(',').map((value) => value.trim()) ?? [];
  return ORGANIZATION_ROLE_NAMES.filter((candidate) => assignedRoles.includes(candidate));
}
export const PLATFORM_ORGANIZATION_API_PATH = '/api/v1/platform/organizations';
export const PLATFORM_ORGANIZATION_CONTEXT_HEADER = 'x-platform-organization-id';
export const PLATFORM_ORGANIZATION_CONTEXT_STORAGE_KEY = '30sales.platform-organization-context';
export const PLATFORM_ERROR_CODE = {
  organizationSlugAlreadyExists: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
} as const;
export const PLATFORM_ORGANIZATION_PAGE_SIZES = [10, 25, 50] as const;
export const PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE = 25;
export const PLATFORM_SEARCH_DEBOUNCE_MILLISECONDS = 250;
export const ORGANIZATION_SLUG_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*';
