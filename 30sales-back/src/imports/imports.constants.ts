export const IMPORT_PROVIDERS = ['twenty', 'chatwoot', 'legacy_postgres'] as const;
export const IMPORT_TARGET_TYPES = ['account', 'person', 'lead', 'opportunity'] as const;
export const IMPORT_TARGET_TYPE = { account: 'account', person: 'person', lead: 'lead', opportunity: 'opportunity' } as const;
export const IMPORT_PREVIEW_STATUS = { alreadyLinked: 'already_linked', typeConflict: 'type_conflict', possibleMatch: 'possible_match', ambiguous: 'ambiguous', noMatch: 'no_match' } as const;
export const LEAD_IMPORT_RESULT_STATUS = { imported: 'imported', alreadyLinked: 'already_linked', reviewRequired: 'review_required', typeConflict: 'type_conflict' } as const;
export const LEAD_IMPORT_AUDIT_ACTION = { leadCreated: 'lead.imported', contactAdded: 'lead.import_contact_imported' } as const;
