export const OPPORTUNITY_STAGES = [
  'qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed',
  'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost',
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const OPPORTUNITY_TRANSITIONS: Record<OpportunityStage, readonly OpportunityStage[]> = {
  qualification: ['closer_contact_pending', 'lost'],
  closer_contact_pending: ['discovery_scheduled', 'lost'],
  discovery_scheduled: ['discovery_done', 'closer_contact_pending', 'lost'],
  discovery_done: ['solution_confirmed', 'proposal_preparing', 'lost'],
  solution_confirmed: ['proposal_preparing', 'lost'],
  proposal_preparing: ['proposal_sent', 'lost'],
  proposal_sent: ['negotiation', 'won', 'lost'],
  negotiation: ['proposal_preparing', 'won', 'lost'],
  won: [],
  lost: [],
};

export const TERMINAL_OPPORTUNITY_STAGES: readonly OpportunityStage[] = ['won', 'lost'];
