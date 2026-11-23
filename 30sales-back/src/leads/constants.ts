export const LEAD_STATUSES = [
  'new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr',
  'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact',
] as const;
export const LEAD_STATUS = { new: 'new', ready: 'ready', contacting: 'contacting', doNotContact: 'do_not_contact', responded: 'responded', convertedToSdr: 'converted_to_sdr' } as const;
export const LEAD_CREATE_RESULT = { businessLineUnavailable: 'business_line_unavailable' } as const;
export const LEAD_EMPTY_CONTACT_COUNT = 0;
export const SDR_AGENT_KEY = 'assistant' as const;
export const SDR_ACTIVE_CONVERSATION_STATUSES = ['open', 'pending', 'snoozed'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_SOURCES = ['manual', 'import', 'whatsapp', 'referral'] as const;
export const LEAD_SOURCE = { import: 'import' } as const;
export const SDR_READINESS_BLOCKER = {
  primaryContactMissing: 'primary_contact_missing',
  phoneMissing: 'phone_missing',
  activeChannelMissing: 'active_channel_missing',
  assistantDisabled: 'assistant_disabled',
  leadNotReady: 'lead_not_ready',
  doNotContact: 'do_not_contact',
  existingConversation: 'existing_conversation',
  contactPermissionUnverified: 'contact_permission_unverified',
  contactOutreachBlocked: 'contact_outreach_blocked',
} as const;
export const SDR_READINESS_BLOCKERS = Object.values(SDR_READINESS_BLOCKER);
export const SDR_PREVIEW_PAGE_SIZE = 50;
export const SDR_PREVIEW_MAX_PAGE_SIZE = 100;
export const CONTACT_OUTREACH_DECISIONS = ['pending', 'approved', 'blocked'] as const;
export const CONTACT_OUTREACH_DECISION = { pending: 'pending', approved: 'approved', blocked: 'blocked' } as const;
export const CONTACT_OUTREACH_BASES = ['documented_permission', 'existing_relationship', 'organization_policy', 'other'] as const;
export const CONTACT_OUTREACH_AUDIT_ACTION = 'lead.contact_outreach_reviewed' as const;
export const LEAD_QUALIFICATION_FACT_STATE = { confirmed: 'confirmed', unknown: 'unknown', notApplicable: 'not_applicable', conflict: 'conflict', estimate: 'estimate' } as const;
export const LEAD_QUALIFICATION_FACT_STATES = [LEAD_QUALIFICATION_FACT_STATE.confirmed, LEAD_QUALIFICATION_FACT_STATE.unknown, LEAD_QUALIFICATION_FACT_STATE.notApplicable, LEAD_QUALIFICATION_FACT_STATE.conflict, LEAD_QUALIFICATION_FACT_STATE.estimate] as const;
export const LEAD_QUALIFICATION_FACT_SOURCE = { manual: 'manual', conversation: 'conversation', import: 'import', enrichment: 'enrichment' } as const;
export const LEAD_QUALIFICATION_FACT_SOURCES = [LEAD_QUALIFICATION_FACT_SOURCE.manual, LEAD_QUALIFICATION_FACT_SOURCE.conversation, LEAD_QUALIFICATION_FACT_SOURCE.import, LEAD_QUALIFICATION_FACT_SOURCE.enrichment] as const;
export const LEAD_QUALIFICATION_FACT_KEY = { need: 'need', decisionRole: 'decision_role', purchaseTiming: 'purchase_timing', fitAssessment: 'fit_assessment', other: 'other' } as const;
export const LEAD_QUALIFICATION_FACT_KEYS = [LEAD_QUALIFICATION_FACT_KEY.need, LEAD_QUALIFICATION_FACT_KEY.decisionRole, LEAD_QUALIFICATION_FACT_KEY.purchaseTiming, LEAD_QUALIFICATION_FACT_KEY.fitAssessment, LEAD_QUALIFICATION_FACT_KEY.other] as const;
export const LEAD_QUALIFICATION_FACT_PAGE_SIZE = 25;
export const LEAD_QUALIFICATION_FACT_MAX_PAGE_SIZE = 100;
export const LEAD_QUALIFICATION_FACT_MAX_VALUE_LENGTH = 2000;
export const LEAD_QUALIFICATION_FACT_MIN_VALUE_LENGTH = 1;
export const LEAD_QUALIFICATION_FACT_MAX_KEY_LENGTH = 64;
export const LEAD_QUALIFICATION_FACT_MIN_KEY_LENGTH = 2;
export const LEAD_QUALIFICATION_FACT_MIN_EVIDENCE_LENGTH = 3;
export const LEAD_QUALIFICATION_FACT_CONFIDENCE_MIN = 0;
export const LEAD_QUALIFICATION_FACT_CONFIDENCE_MAX = 1;
export const LEAD_QUALIFICATION_FACT_AUDIT_ACTION = 'lead.qualification_fact_recorded' as const;
export const LEAD_QUALIFICATION_FACT_RESULT = { leadNotFound: 'lead_not_found', sourceMessageNotFound: 'source_message_not_found' } as const;
export const LEAD_QUALIFICATION_SUGGESTION = { maxSourceMessages: 20, maxResults: 8, evidenceMaxLength: 1000, maxSourceMessageLength: 4000, maxContextLength: 24000, emptyContextLength: 0, auditAction: 'lead.qualification_suggestions_generated' } as const;
export const LEAD_QUALIFICATION_SOURCE_DIRECTION = 'inbound' as const;
export const LEAD_QUALIFICATION_SUGGESTION_ERROR = { assistantUnavailable: 'QUALIFICATION_ASSISTANT_UNAVAILABLE', noConversation: 'QUALIFICATION_CONVERSATION_NOT_FOUND', noSuggestions: 'QUALIFICATION_SUGGESTIONS_EMPTY' } as const;
export const LEAD_CONTACT_CREATE_RESULT = { leadNotFound: 'lead_not_found', duplicateOnLead: 'duplicate_contact', ambiguousAccountMatch: 'ambiguous_account_contact' } as const;
export const LEAD_ACCOUNT_CONTACT_MATCH_LIMIT = 2;
export const LEAD_CONTACT_PHONE_MATCH_MIN_DIGITS = 7;
export const LEAD_CONTACT_ERROR_CODE = { duplicate: 'LEAD_CONTACT_ALREADY_EXISTS', ambiguousAccountMatch: 'LEAD_ACCOUNT_CONTACT_AMBIGUOUS' } as const;
export const LEAD_ACCOUNT_CONTACT_PAGE_SIZE = 25;
export const LEAD_ACCOUNT_CONTACT_MAX_PAGE_SIZE = 100;
export const LEAD_ACCOUNT_CONTACT_RESULT = { leadNotFound: 'lead_not_found', personUnavailable: 'account_contact_unavailable', alreadyLinked: 'account_contact_already_linked' } as const;
export const LEAD_ACCOUNT_CONTACT_AUDIT_ACTION = 'lead.contact_linked_from_account' as const;
export const LEAD_ACCOUNT_CONTACT_ERROR_CODE = { personUnavailable: 'LEAD_ACCOUNT_CONTACT_UNAVAILABLE', alreadyLinked: 'LEAD_ACCOUNT_CONTACT_ALREADY_LINKED' } as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];
export const UNASSIGNED_SEGMENT_FILTER = 'unassigned';
export const LEAD_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  new: ['researching', 'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'paused', 'do_not_contact'],
  researching: ['ready', 'invalid_contact', 'out_of_profile', 'duplicate_review', 'paused', 'do_not_contact'],
  ready: ['queued', 'researching', 'paused', 'do_not_contact'],
  queued: ['contacting', 'paused', 'do_not_contact', 'invalid_contact'],
  contacting: ['responded', 'no_response', 'paused', 'do_not_contact', 'invalid_contact'],
  responded: ['converted_to_sdr', 'ready', 'paused', 'do_not_contact', 'out_of_profile'],
  converted_to_sdr: [], invalid_contact: [], no_channel: [], out_of_profile: [],
  duplicate_review: ['new', 'out_of_profile'], no_response: ['researching', 'paused', 'do_not_contact'],
  paused: ['new', 'researching', 'ready', 'do_not_contact'], do_not_contact: [],
};
