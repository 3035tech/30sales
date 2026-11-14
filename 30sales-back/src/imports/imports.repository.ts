import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { database } from '../db';
import { externalRecords } from '../db/schema';
import { CanonicalEntityType, ExternalIdentityCheckResultDto, ImportRepositoryIdentityCheckDto } from './imports.dto';

@Injectable()
export class ImportsRepository {
  async checkExternalIdentities(input: ImportRepositoryIdentityCheckDto): Promise<ExternalIdentityCheckResultDto[]> {
    const recordTypes = [...new Set(input.input.identities.map((identity) => identity.recordType))];
    const externalIds = [...new Set(input.input.identities.map((identity) => identity.externalId))];
    const rows = await database.select({ recordType: externalRecords.recordType, externalId: externalRecords.externalId, accountId: externalRecords.accountId, personId: externalRecords.personId, leadId: externalRecords.leadId, opportunityId: externalRecords.opportunityId })
      .from(externalRecords)
      .where(and(eq(externalRecords.organizationId, input.organizationId), eq(externalRecords.provider, input.input.provider), inArray(externalRecords.recordType, recordTypes), inArray(externalRecords.externalId, externalIds)));
    const linked = new Map(rows.map((row) => {
      const target: { targetType: CanonicalEntityType; targetId: string } | null = row.accountId ? { targetType: 'account', targetId: row.accountId } : row.personId ? { targetType: 'person', targetId: row.personId } : row.leadId ? { targetType: 'lead', targetId: row.leadId } : row.opportunityId ? { targetType: 'opportunity', targetId: row.opportunityId } : null;
      return [`${row.recordType}\u0000${row.externalId}`, target] as const;
    }));
    return input.input.identities.map((identity) => {
      const target = linked.get(`${identity.recordType}\u0000${identity.externalId}`) ?? null;
      return new ExternalIdentityCheckResultDto(identity.recordType, identity.externalId, target ? 'linked' : 'unmapped', target?.targetType ?? null, target?.targetId ?? null);
    });
  }
}
