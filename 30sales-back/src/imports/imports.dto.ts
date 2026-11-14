import { z } from 'zod';

const externalIdentitySchema = z.object({
  recordType: z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9_.:-]+$/),
  externalId: z.string().trim().min(1).max(240),
}).strict();

export const checkExternalIdentitiesSchema = z.object({
  provider: z.enum(['twenty', 'chatwoot', 'sofia_postgres']),
  identities: z.array(externalIdentitySchema).min(1).max(500).superRefine((identities, context) => {
    const seen = new Set<string>();
    identities.forEach((identity, index) => {
      const key = `${identity.recordType}\u0000${identity.externalId}`;
      if (seen.has(key)) context.addIssue({ code: 'custom', path: [index, 'externalId'], message: 'Duplicate external identity.' });
      seen.add(key);
    });
  }),
}).strict();

export type CheckExternalIdentitiesInputDto = z.infer<typeof checkExternalIdentitiesSchema>;

export class ImportRepositoryIdentityCheckDto {
  constructor(readonly organizationId: string, readonly input: CheckExternalIdentitiesInputDto) {}
}

export type CanonicalEntityType = 'account' | 'person' | 'lead' | 'opportunity';
export class ExternalIdentityCheckResultDto {
  constructor(readonly recordType: string, readonly externalId: string, readonly status: 'linked' | 'unmapped', readonly targetType: CanonicalEntityType | null, readonly targetId: string | null) {}
}
export class ExternalIdentityCheckDto {
  constructor(readonly provider: CheckExternalIdentitiesInputDto['provider'], readonly identities: ExternalIdentityCheckResultDto[]) {}
}

const previewRecordSchema = externalIdentitySchema.extend({
  targetType: z.enum(['account', 'person', 'lead', 'opportunity']),
  accountName: z.string().trim().min(1).max(160).optional(),
  contactName: z.string().trim().min(1).max(160).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  sourceStatus: z.string().trim().min(1).max(120).optional(),
}).strict().superRefine((record, context) => {
  if (record.targetType === 'account' && !record.accountName) context.addIssue({ code: 'custom', path: ['accountName'], message: 'Account imports need an account name.' });
  if (record.targetType === 'person' && !record.contactName && !record.email && !record.phone) context.addIssue({ code: 'custom', path: ['contactName'], message: 'Person imports need a name or contact method.' });
  if (record.targetType === 'lead' && (!record.accountName || !record.contactName || (!record.email && !record.phone))) context.addIssue({ code: 'custom', path: ['contactName'], message: 'Lead imports need an account, contact name, and email or phone.' });
  if (record.targetType === 'opportunity' && !record.accountName) context.addIssue({ code: 'custom', path: ['accountName'], message: 'Opportunity imports need an account name.' });
});

export const previewImportsSchema = z.object({
  provider: z.enum(['twenty', 'chatwoot', 'sofia_postgres']),
  records: z.array(previewRecordSchema).min(1).max(100).superRefine((records, context) => {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      const key = `${record.recordType}\u0000${record.externalId}`;
      if (seen.has(key)) context.addIssue({ code: 'custom', path: [index, 'externalId'], message: 'Duplicate external identity in preview.' });
      seen.add(key);
    });
  }),
}).strict();

export type PreviewImportsInputDto = z.infer<typeof previewImportsSchema>;
export type PreviewImportRecordDto = PreviewImportsInputDto['records'][number];
export class ImportRepositoryPreviewDto {
  constructor(readonly organizationId: string, readonly input: PreviewImportsInputDto) {}
}
export type ImportMatchField = 'external_id' | 'account_name' | 'email' | 'phone';
export type ImportPreviewStatus = 'already_linked' | 'type_conflict' | 'possible_match' | 'ambiguous' | 'no_match';
export class ImportPreviewCandidateDto {
  constructor(readonly targetType: CanonicalEntityType, readonly targetId: string, readonly label: string, readonly matchedBy: ImportMatchField[]) {}
}
export class ImportPreviewLinkDto {
  constructor(readonly targetType: CanonicalEntityType, readonly targetId: string) {}
}
export class ImportPreviewRecordResultDto {
  constructor(readonly recordType: string, readonly externalId: string, readonly targetType: CanonicalEntityType, readonly sourceStatus: string | null, readonly status: ImportPreviewStatus, readonly linkedTarget: ImportPreviewLinkDto | null, readonly candidates: ImportPreviewCandidateDto[]) {}
}
export class ImportsPreviewDto {
  constructor(readonly provider: PreviewImportsInputDto['provider'], readonly records: ImportPreviewRecordResultDto[]) {}
}
