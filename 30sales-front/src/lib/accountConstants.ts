export const ACCOUNT_MARKET_SEGMENTS = ['education', 'sports', 'fitness', 'other'] as const;
export const ACCOUNT_INDUSTRIES = ['education', 'sports', 'vehicle_rental', 'professional_services', 'retail', 'hospitality', 'nonprofit', 'other'] as const;
export const ACCOUNT_MARKET_FILTER = { all: 'all', unclassified: 'unclassified' } as const;
export const ACCOUNT_PROFILE_EMPTY_VALUE = '';
export const ACCOUNT_CONTACT_LIMITS = { pageSize: 25, offsetStart: 0, pageStart: 1 } as const;
export const ACCOUNT_CONTACT_ERROR_CODE = { alreadyUnlinked: 'ACCOUNT_CONTACT_ALREADY_UNLINKED', alreadyLinked: 'ACCOUNT_CONTACT_ALREADY_LINKED' } as const;
export const ACCOUNT_PERSON_STATUS = { active: 'active', revoked: 'revoked' } as const;
export const ACCOUNT_PERSON_STATUSES = [ACCOUNT_PERSON_STATUS.active, ACCOUNT_PERSON_STATUS.revoked] as const;
