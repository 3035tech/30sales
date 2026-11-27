export const ACCOUNT_MARKET_SEGMENTS = ['education', 'sports', 'fitness', 'other'] as const;
export const ACCOUNT_INDUSTRIES = ['education', 'sports', 'vehicle_rental', 'professional_services', 'retail', 'hospitality', 'nonprofit', 'other'] as const;
export const ACCOUNT_SEGMENT_RESULT = { exists: 'segment_exists', accountNotFound: 'account_not_found', segmentNotFound: 'segment_not_found' } as const;
export const DATABASE_UNIQUE_VIOLATION_CODE = '23505';
export const ACCOUNT_SEGMENT_ERROR_CODE = { exists: 'ACCOUNT_SEGMENT_ALREADY_EXISTS', restricted: 'ACCOUNT_SEGMENT_MANAGEMENT_RESTRICTED', notFound: 'ACCOUNT_SEGMENT_NOT_FOUND', accountNotFound: 'ACCOUNT_NOT_FOUND' } as const;
export const ACCOUNT_SEGMENT_AUDIT = { created: 'account.segment_created', changed: 'account.segment_changed', segmentEntity: 'account_segment', accountEntity: 'account' } as const;
export type AccountMarketSegment = (typeof ACCOUNT_MARKET_SEGMENTS)[number];
export const QUERY_BOOLEAN_VALUES = { enabled: 'true', disabled: 'false' } as const;
export const ACCOUNT_PERSON_STATUS = { active: 'active', revoked: 'revoked' } as const;
export const ACCOUNT_PERSON_STATUSES = [ACCOUNT_PERSON_STATUS.active, ACCOUNT_PERSON_STATUS.revoked] as const;
export const ACCOUNT_PERSON_AUDIT = { linked: 'account.person_linked', revoked: 'account.person_unlinked', entity: 'account_person', legacy: 'legacy_relationship', actorUser: 'user' } as const;
export const ACCOUNT_CONTACT_PAGE_SIZE = 25;
export const ACCOUNT_CONTACT_MAX_PAGE_SIZE = 100;
export const ACCOUNT_CONTACT_RESULT = { accountNotFound: 'account_not_found', personNotFound: 'person_not_found', alreadyRevoked: 'already_revoked', alreadyActive: 'already_active' } as const;
export const ACCOUNT_CONTACT_ERROR_CODE = { accountNotFound: 'ACCOUNT_NOT_FOUND', personNotFound: 'ACCOUNT_CONTACT_NOT_FOUND', alreadyRevoked: 'ACCOUNT_CONTACT_ALREADY_UNLINKED', alreadyActive: 'ACCOUNT_CONTACT_ALREADY_LINKED', restricted: 'ACCOUNT_CONTACT_MANAGEMENT_RESTRICTED' } as const;

export const ACCOUNT_PROFILE_AUDIT = {
  changed: 'account.profile_changed',
  entity: 'account',
} as const;

export const ACCOUNT_PROFILE_ERROR_CODE = {
  notFound: 'ACCOUNT_NOT_FOUND',
} as const;
