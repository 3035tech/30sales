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
