export const ACCOUNT_MARKET_SEGMENTS = ['education', 'sports', 'fitness', 'other'] as const;
export type AccountMarketSegment = (typeof ACCOUNT_MARKET_SEGMENTS)[number];
export const QUERY_BOOLEAN_VALUES = { enabled: 'true', disabled: 'false' } as const;

export const ACCOUNT_PROFILE_AUDIT = {
  changed: 'account.profile_changed',
  entity: 'account',
} as const;

export const ACCOUNT_PROFILE_ERROR_CODE = {
  notFound: 'ACCOUNT_NOT_FOUND',
} as const;
