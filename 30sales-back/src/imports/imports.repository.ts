import { Injectable } from '@nestjs/common';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { accounts, externalRecords, leads, opportunities, people } from '../db/schema';
import { CanonicalEntityType, ExternalIdentityCheckResultDto, ImportMatchField, ImportPreviewCandidateDto, ImportPreviewLinkDto, ImportPreviewRecordResultDto, ImportsPreviewDto, ImportRepositoryIdentityCheckDto, ImportRepositoryPreviewDto, PreviewImportRecordDto } from './imports.dto';

function normalizedName(value: string | undefined): string { return (value ?? '').trim().toLocaleLowerCase('en-US'); }
function normalizedEmail(value: string | undefined): string { return (value ?? '').trim().toLocaleLowerCase('en-US'); }
function normalizedPhone(value: string | undefined): string { return (value ?? '').replace(/\D/g, ''); }
function unique<T extends string>(values: T[]): T[] { return [...new Set(values.filter(Boolean))]; }

@Injectable()
export class ImportsRepository {
  async preview(input: ImportRepositoryPreviewDto): Promise<ImportsPreviewDto> {
    const recordTypes = unique(input.input.records.map((record) => record.recordType));
    const externalIds = unique(input.input.records.map((record) => record.externalId));
    const [externalRows, accountRows, personRows, leadRows, opportunityRows] = await Promise.all([
      database.select({ recordType: externalRecords.recordType, externalId: externalRecords.externalId, accountId: externalRecords.accountId, personId: externalRecords.personId, leadId: externalRecords.leadId, opportunityId: externalRecords.opportunityId })
        .from(externalRecords).where(and(eq(externalRecords.organizationId, input.organizationId), eq(externalRecords.provider, input.input.provider), inArray(externalRecords.recordType, recordTypes), inArray(externalRecords.externalId, externalIds))),
      this.findAccounts(input),
      this.findPeople(input),
      this.findLeads(input),
      this.findOpportunities(input),
    ]);
    const externalMap = new Map(externalRows.map((row) => {
      const target = row.accountId ? { targetType: 'account' as const, targetId: row.accountId } : row.personId ? { targetType: 'person' as const, targetId: row.personId } : row.leadId ? { targetType: 'lead' as const, targetId: row.leadId } : row.opportunityId ? { targetType: 'opportunity' as const, targetId: row.opportunityId } : null;
      return [`${row.recordType}\u0000${row.externalId}`, target] as const;
    }));
    const results = input.input.records.map((record) => this.mapPreviewRecord(record, externalMap, accountRows, personRows, leadRows, opportunityRows));
    return new ImportsPreviewDto(input.input.provider, results);
  }

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

  private async findAccounts(input: ImportRepositoryPreviewDto) {
    const names = unique(input.input.records.filter((record) => record.targetType === 'account').map((record) => normalizedName(record.accountName)));
    if (!names.length) return [];
    return database.select({ id: accounts.id, name: accounts.name, normalizedName: sql<string>`lower(trim(${accounts.name}))` })
      .from(accounts).where(and(eq(accounts.organizationId, input.organizationId), inArray(sql<string>`lower(trim(${accounts.name}))`, names)));
  }

  private async findPeople(input: ImportRepositoryPreviewDto) {
    const records = input.input.records.filter((record) => record.targetType === 'person' || record.targetType === 'lead');
    const emails = unique(records.map((record) => normalizedEmail(record.email)));
    const phones = unique(records.map((record) => normalizedPhone(record.phone)));
    const matches = [];
    if (emails.length) matches.push(inArray(sql<string>`lower(trim(coalesce(${people.email}, '')))`, emails));
    if (phones.length) matches.push(inArray(sql<string>`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g')`, phones));
    if (!matches.length) return [];
    return database.select({ id: people.id, name: people.name, email: people.email, phone: people.phone, normalizedEmail: sql<string>`lower(trim(coalesce(${people.email}, '')))`, normalizedPhone: sql<string>`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g')` })
      .from(people).where(and(eq(people.organizationId, input.organizationId), or(...matches)));
  }

  private async findLeads(input: ImportRepositoryPreviewDto) {
    const records = input.input.records.filter((record) => record.targetType === 'lead');
    const emails = unique(records.map((record) => normalizedEmail(record.email)));
    const phones = unique(records.map((record) => normalizedPhone(record.phone)));
    const matches = [];
    if (emails.length) matches.push(inArray(sql<string>`lower(trim(coalesce(${people.email}, '')))`, emails));
    if (phones.length) matches.push(inArray(sql<string>`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g')`, phones));
    if (!matches.length) return [];
    return database.select({ id: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, normalizedEmail: sql<string>`lower(trim(coalesce(${people.email}, '')))`, normalizedPhone: sql<string>`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g')` })
      .from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .where(and(eq(leads.organizationId, input.organizationId), or(...matches)));
  }

  private async findOpportunities(input: ImportRepositoryPreviewDto) {
    const names = unique(input.input.records.filter((record) => record.targetType === 'opportunity').map((record) => normalizedName(record.accountName)));
    if (!names.length) return [];
    return database.select({ id: opportunities.id, name: opportunities.name, accountName: accounts.name, normalizedName: sql<string>`lower(trim(${accounts.name}))` })
      .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
      .where(and(eq(opportunities.organizationId, input.organizationId), inArray(sql<string>`lower(trim(${accounts.name}))`, names)));
  }

  private mapPreviewRecord(
    record: PreviewImportRecordDto,
    externalMap: Map<string, { targetType: CanonicalEntityType; targetId: string } | null>,
    accountRows: Awaited<ReturnType<ImportsRepository['findAccounts']>>,
    personRows: Awaited<ReturnType<ImportsRepository['findPeople']>>,
    leadRows: Awaited<ReturnType<ImportsRepository['findLeads']>>,
    opportunityRows: Awaited<ReturnType<ImportsRepository['findOpportunities']>>,
  ): ImportPreviewRecordResultDto {
    const existing = externalMap.get(`${record.recordType}\u0000${record.externalId}`);
    if (existing) {
      const status = existing.targetType === record.targetType ? 'already_linked' : 'type_conflict';
      return new ImportPreviewRecordResultDto(record.recordType, record.externalId, record.targetType, record.sourceStatus ?? null, status, new ImportPreviewLinkDto(existing.targetType, existing.targetId), []);
    }
    const candidates = new Map<string, ImportPreviewCandidateDto>();
    const addCandidate = (targetType: CanonicalEntityType, targetId: string, label: string, matchedBy: ImportMatchField[]) => {
      const current = candidates.get(targetId);
      if (current) {
        candidates.set(targetId, new ImportPreviewCandidateDto(targetType, targetId, label, unique([...current.matchedBy, ...matchedBy])));
      } else candidates.set(targetId, new ImportPreviewCandidateDto(targetType, targetId, label, matchedBy));
    };
    const accountName = normalizedName(record.accountName);
    const email = normalizedEmail(record.email);
    const phone = normalizedPhone(record.phone);
    if (record.targetType === 'account') {
      for (const account of accountRows) if (account.normalizedName === accountName) addCandidate('account', account.id, account.name, ['account_name']);
    }
    if (record.targetType === 'person') {
      for (const person of personRows) {
        const matchedBy: ImportMatchField[] = [];
        if (email && person.normalizedEmail === email) matchedBy.push('email');
        if (phone && person.normalizedPhone === phone) matchedBy.push('phone');
        if (matchedBy.length) addCandidate('person', person.id, person.name, matchedBy);
      }
    }
    if (record.targetType === 'lead') {
      for (const lead of leadRows) {
        const matchedBy: ImportMatchField[] = [];
        if (email && lead.normalizedEmail === email) matchedBy.push('email');
        if (phone && lead.normalizedPhone === phone) matchedBy.push('phone');
        if (matchedBy.length) addCandidate('lead', lead.id, `${lead.accountName} — ${lead.contactName}`, matchedBy);
      }
    }
    if (record.targetType === 'opportunity') {
      for (const opportunity of opportunityRows) if (opportunity.normalizedName === accountName) addCandidate('opportunity', opportunity.id, `${opportunity.accountName} — ${opportunity.name}`, ['account_name']);
    }
    const candidateList = [...candidates.values()];
    const status = candidateList.length > 1 ? 'ambiguous' : candidateList.length === 1 ? 'possible_match' : 'no_match';
    return new ImportPreviewRecordResultDto(record.recordType, record.externalId, record.targetType, record.sourceStatus ?? null, status, null, candidateList);
  }
}
