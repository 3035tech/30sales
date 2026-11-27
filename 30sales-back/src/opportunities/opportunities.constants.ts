export const OPPORTUNITY_STAGES = [
  'qualification', 'closer_contact_pending', 'discovery_scheduled', 'discovery_done', 'solution_confirmed',
  'proposal_preparing', 'proposal_sent', 'negotiation', 'won', 'lost', 'custom',
] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];
export const OPPORTUNITY_CREATION_MODES = ['human', 'ai', 'import', 'system'] as const;
export const DEFAULT_PIPELINE_STAGES: readonly { key: Exclude<OpportunityStage, 'custom'>; position: number }[] = [
  { key: 'qualification', position: 100 }, { key: 'closer_contact_pending', position: 200 },
  { key: 'discovery_scheduled', position: 300 }, { key: 'discovery_done', position: 400 },
  { key: 'solution_confirmed', position: 500 }, { key: 'proposal_preparing', position: 600 },
  { key: 'proposal_sent', position: 700 }, { key: 'negotiation', position: 800 },
  { key: 'won', position: 900 }, { key: 'lost', position: 1000 },
];

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
  custom: [],
};

export const TERMINAL_OPPORTUNITY_STAGES: readonly OpportunityStage[] = ['won', 'lost'];
