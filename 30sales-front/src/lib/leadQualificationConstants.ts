export const LEAD_QUALIFICATION_FACT_STATE = {
  confirmed: 'confirmed',
  unknown: 'unknown',
  notApplicable: 'not_applicable',
  conflict: 'conflict',
  estimate: 'estimate',
} as const

export const LEAD_QUALIFICATION_FACT_SOURCE = {
  manual: 'manual',
  conversation: 'conversation',
  import: 'import',
  enrichment: 'enrichment',
} as const

export const LEAD_QUALIFICATION_FACT_STATES = [
  LEAD_QUALIFICATION_FACT_STATE.confirmed,
  LEAD_QUALIFICATION_FACT_STATE.unknown,
  LEAD_QUALIFICATION_FACT_STATE.notApplicable,
  LEAD_QUALIFICATION_FACT_STATE.conflict,
  LEAD_QUALIFICATION_FACT_STATE.estimate,
] as const

export const LEAD_QUALIFICATION_FACT_SOURCES = [
  LEAD_QUALIFICATION_FACT_SOURCE.manual,
  LEAD_QUALIFICATION_FACT_SOURCE.conversation,
  LEAD_QUALIFICATION_FACT_SOURCE.import,
  LEAD_QUALIFICATION_FACT_SOURCE.enrichment,
] as const

export const LEAD_QUALIFICATION_FACT_KEY = {
  need: 'need',
  decisionRole: 'decision_role',
  purchaseTiming: 'purchase_timing',
  fitAssessment: 'fit_assessment',
  other: 'other',
} as const

export const LEAD_QUALIFICATION_FACT_KEYS = [
  LEAD_QUALIFICATION_FACT_KEY.need,
  LEAD_QUALIFICATION_FACT_KEY.decisionRole,
  LEAD_QUALIFICATION_FACT_KEY.purchaseTiming,
  LEAD_QUALIFICATION_FACT_KEY.fitAssessment,
  LEAD_QUALIFICATION_FACT_KEY.other,
] as const

export const LEAD_QUALIFICATION_FACT_LIMITS = {
  pageSize: 25,
  maxPageSize: 100,
  offsetStart: 0,
  pageStart: 1,
  keyMinLength: 2,
  keyMaxLength: 64,
  valueMinLength: 1,
  valueMaxLength: 2000,
  evidenceMinLength: 3,
  confidenceMin: 0,
  confidenceMax: 1,
} as const

export const LEAD_QUALIFICATION_SUGGESTION_LIMITS = { maxResults: 8 } as const
export const LEAD_QUALIFICATION_SUGGESTION_ERROR_CODE = {
  assistantUnavailable: 'QUALIFICATION_ASSISTANT_UNAVAILABLE',
  noConversation: 'QUALIFICATION_CONVERSATION_NOT_FOUND',
} as const
