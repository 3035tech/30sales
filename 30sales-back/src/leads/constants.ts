export const LEAD_STATUSES = [
  'new', 'researching', 'ready', 'queued', 'contacting', 'responded', 'converted_to_sdr',
  'invalid_contact', 'no_channel', 'out_of_profile', 'duplicate_review', 'no_response', 'paused', 'do_not_contact',
] as const;
export const LEAD_STATUS = { responded: 'responded', convertedToSdr: 'converted_to_sdr' } as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_SOURCES = ['manual', 'import', 'whatsapp', 'referral'] as const;
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
