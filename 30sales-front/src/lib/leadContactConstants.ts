export const LEAD_CONTACT_ERROR_CODE = {
  duplicate: 'LEAD_CONTACT_ALREADY_EXISTS',
  ambiguousAccountMatch: 'LEAD_ACCOUNT_CONTACT_AMBIGUOUS',
  unavailable: 'LEAD_ACCOUNT_CONTACT_UNAVAILABLE',
  alreadyLinked: 'LEAD_ACCOUNT_CONTACT_ALREADY_LINKED',
} as const

export const LEAD_ACCOUNT_CONTACT_LIMITS = {
  pageSize: 25,
  offsetStart: 0,
  pageStart: 1,
} as const

export const ASYNC_RESULT_STATUS = { fulfilled: 'fulfilled' } as const
export const LEAD_CONTACT_PRIMARY_SORT_ORDER = { primaryFirst: -1, secondaryFirst: 1 } as const
