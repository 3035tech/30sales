export const BUSINESS_LINE_STATUS = { active: 'active', paused: 'paused', archived: 'archived' } as const;
export const BUSINESS_LINE_STATUSES = [BUSINESS_LINE_STATUS.active, BUSINESS_LINE_STATUS.paused, BUSINESS_LINE_STATUS.archived] as const;
export const BUSINESS_LINE_ERROR = {
  managementForbidden: 'BUSINESS_LINE_MANAGEMENT_FORBIDDEN',
  duplicateSlug: 'BUSINESS_LINE_SLUG_EXISTS',
  notFound: 'BUSINESS_LINE_NOT_FOUND',
  invalidMembers: 'BUSINESS_LINE_MEMBERS_INVALID',
  creatorMembershipMissing: 'BUSINESS_LINE_CREATOR_MEMBERSHIP_MISSING',
} as const;
