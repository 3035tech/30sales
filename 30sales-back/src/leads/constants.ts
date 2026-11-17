export const LEAD_STATUSES = [
  'new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr',
  'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact',
] as const;
export const LEAD_STATUS = { new: 'new', ready: 'ready', contacting: 'contacting', doNotContact: 'do_not_contact', responded: 'responded', convertedToSdr: 'converted_to_sdr' } as const;
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
