export const INBOX_ACTIVE_CONVERSATION_STATUSES = ['open', 'pending', 'snoozed'] as const;
export const INBOX_CONTACT_RECONCILIATION_RESULT = { notFound: 'not_found', missingContact: 'missing_contact', invalidPhone: 'invalid_phone', notOwner: 'not_owner' } as const;
export const INBOX_CONTACT_RECONCILIATION_AUDIT_ACTION = 'conversation.contact_reconciled' as const;
export const INBOX_CONTACT_RECONCILIATION_ERROR_CODE = { notFound: 'CONVERSATION_OR_LEAD_NOT_FOUND', missingContact: 'CONVERSATION_CONTACT_MISSING', invalidPhone: 'INVALID_CONTACT_PHONE', ownerRequired: 'CONVERSATION_OWNER_REQUIRED' } as const;
