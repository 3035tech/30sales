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
export const PLATFORM_API_PATH = '/api/v1/platform';
export const PLATFORM_ORGANIZATION_API_PATH = `${PLATFORM_API_PATH}/organizations`;
export const BUSINESS_LINES_API_PATH = '/api/v1/business-lines';
export const PLATFORM_ORGANIZATION_CONTEXT_HEADER = 'x-platform-organization-id';
export const PLATFORM_ORGANIZATION_CONTEXT_STORAGE_KEY = '30sales.platform-organization-context';
export const PLATFORM_ERROR_CODE = {
  organizationSlugAlreadyExists: 'ORGANIZATION_SLUG_ALREADY_EXISTS',
} as const;
export const PLATFORM_EVOLUTION_CHECK_ERROR = {
  encryptionMissing: 'CHANNEL_CREDENTIALS_KEY_MISSING',
  encryptionInvalid: 'CHANNEL_CREDENTIALS_KEY_INVALID',
  notConfigured: 'PLATFORM_EVOLUTION_NOT_CONFIGURED',
  configurationInvalid: 'PLATFORM_EVOLUTION_CONFIGURATION_INVALID',
  keyRejected: 'EVOLUTION_API_KEY_REJECTED',
  endpointNotFound: 'EVOLUTION_DISCOVERY_ENDPOINT_NOT_FOUND',
  targetBlocked: 'EVOLUTION_DISCOVERY_TARGET_BLOCKED',
  timeout: 'EVOLUTION_DISCOVERY_TIMEOUT',
  requestFailed: 'EVOLUTION_DISCOVERY_REQUEST_FAILED',
  invalidResponse: 'EVOLUTION_DISCOVERY_INVALID_RESPONSE',
} as const;
export const PLATFORM_EVOLUTION_CHECK_SOURCE = { entered: 'entered', saved: 'saved' } as const;
export const PLATFORM_ORGANIZATION_PAGE_SIZES = [10, 25, 50] as const;
export const PLATFORM_ORGANIZATION_DEFAULT_PAGE_SIZE = 25;
export const PLATFORM_AI_USAGE_PAGE_SIZES = [10, 25, 50] as const;
export const PLATFORM_AI_USAGE_DEFAULT_PAGE_SIZE = 25;
export const PLATFORM_AI_USAGE_DEFAULT_PAGE_OFFSET = 0;
export const PLATFORM_AI_USAGE_MAXIMUM_RANGE_DAYS = 366;
export const PLATFORM_AI_USAGE_MILLISECONDS_PER_DAY = 86_400_000;
export const PLATFORM_SEARCH_DEBOUNCE_MILLISECONDS = 250;
export const ORGANIZATION_SLUG_PATTERN = '[a-z0-9]+(-[a-z0-9]+)*';
