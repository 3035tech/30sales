import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, eq, exists, inArray, or, sql } from 'drizzle-orm';
import { database } from '../db';
import { member as authMember } from '../db/auth-schema';
import { accounts, auditEvents, businessLineMembers, businessLines, externalRecords, leadContacts, leadStatusHistory, leads, opportunities, people } from '../db/schema';
import { LEAD_SOURCE, LEAD_STATUS } from '../leads/constants';
import { IMPORT_PREVIEW_STATUS, IMPORT_TARGET_TYPE, LEAD_IMPORT_AUDIT_ACTION, LEAD_IMPORT_RESULT_STATUS } from './imports.constants';
import { CanonicalEntityType, ExternalIdentityCheckResultDto, ImportLeadsResultDto, ImportMatchField, ImportPreviewCandidateDto, ImportPreviewLinkDto, ImportPreviewRecordResultDto, ImportRepositoryIdentityCheckDto, ImportRepositoryLeadsDto, ImportRepositoryPreviewDto, ImportsPreviewDto, LeadImportRecordResultDto, PreviewImportRecordDto } from './imports.dto';

function normalizedName(value: string | undefined): string { return (value ?? '').trim().toLocaleLowerCase('en-US'); }
function normalizedEmail(value: string | undefined): string { return (value ?? '').trim().toLocaleLowerCase('en-US'); }
function normalizedPhone(value: string | undefined): string { return (value ?? '').replace(/\D/g, ''); }
function unique<T extends string>(values: T[]): T[] { return [...new Set(values.filter(Boolean))]; }

@Injectable()
export class ImportsRepository {
  async importLeads(input: ImportRepositoryLeadsDto): Promise<ImportLeadsResultDto | 'business_line_unavailable'> {
    const records = await database.transaction(async (transaction) => {
      const results: LeadImportRecordResultDto[] = [];
      const accountCache = new Map<string, { id: string; ambiguous: boolean }>();
      const leadCache = new Map<string, { id: string; primaryPersonId: string | null }>();
      const personCache = new Map<string, string>();
      const seenContacts = new Set<string>();
      const [businessLine] = await transaction.select({ id: businessLines.id }).from(businessLines)
        .where(and(eq(businessLines.organizationId, input.organizationId), input.input.businessLineId ? eq(businessLines.id, input.input.businessLineId) : eq(businessLines.isDefault, true), eq(businessLines.status, 'active'))).limit(1);
      if (!businessLine) return 'business_line_unavailable';
      if (!input.canManageAll) {
        const [lineMembership] = await transaction.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
          .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
          .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, businessLine.id), eq(authMember.userId, input.userId))).limit(1);
        if (!lineMembership) return 'business_line_unavailable';
      }

      for (const record of input.input.records) {
        const [external] = await transaction.select({ accountId: externalRecords.accountId, personId: externalRecords.personId, leadId: externalRecords.leadId, opportunityId: externalRecords.opportunityId })
          .from(externalRecords).where(and(eq(externalRecords.organizationId, input.organizationId), eq(externalRecords.provider, input.input.provider), eq(externalRecords.recordType, record.recordType), eq(externalRecords.externalId, record.externalId))).limit(1);
        if (external) {
          const linkedLeadId = external.leadId;
          if (linkedLeadId) {
            const [linkedLead] = await transaction.select({ id: leads.id }).from(leads)
              .where(and(eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, businessLine.id), eq(leads.id, linkedLeadId))).limit(1);
            if (!linkedLead) {
              results.push(new LeadImportRecordResultDto(record.recordType, record.externalId, LEAD_IMPORT_RESULT_STATUS.reviewRequired, null));
              continue;
            }
          }
          results.push(new LeadImportRecordResultDto(record.recordType, record.externalId, linkedLeadId ? LEAD_IMPORT_RESULT_STATUS.alreadyLinked : LEAD_IMPORT_RESULT_STATUS.typeConflict, linkedLeadId));
          continue;
        }

        const email = normalizedEmail(record.email);
        const phone = normalizedPhone(record.phone);
        const contactKeys = [email && `email:${email}`, phone && `phone:${phone}`].filter((value): value is string => Boolean(value));
        if (contactKeys.some((key) => seenContacts.has(key))) {
          results.push(new LeadImportRecordResultDto(record.recordType, record.externalId, LEAD_IMPORT_RESULT_STATUS.reviewRequired, null));
          continue;
        }
        const existingLeads = await transaction.select({ id: leads.id }).from(leads)
          .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .where(and(eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, businessLine.id), or(
            ...(email ? [sql<boolean>`lower(trim(coalesce(${people.email}, ''))) = ${email}`] : []),
            ...(phone ? [sql<boolean>`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g') = ${phone}`] : []),
          ))).limit(1);
        if (existingLeads.length) {
          results.push(new LeadImportRecordResultDto(record.recordType, record.externalId, LEAD_IMPORT_RESULT_STATUS.reviewRequired, null));
          continue;
        }

        const accountKey = normalizedName(record.accountName);
        let account = accountCache.get(accountKey);
        if (!account) {
          const matches = await transaction.select({ id: accounts.id }).from(accounts)
            .where(and(eq(accounts.organizationId, input.organizationId), sql<boolean>`lower(trim(${accounts.name})) = ${accountKey}`)).limit(2);
          account = matches.length > 1 ? { id: '', ambiguous: true } : matches.length === 1 ? { id: matches[0].id, ambiguous: false } : undefined;
          if (account) accountCache.set(accountKey, account);
        }
        if (account?.ambiguous) {
          results.push(new LeadImportRecordResultDto(record.recordType, record.externalId, LEAD_IMPORT_RESULT_STATUS.reviewRequired, null));
          continue;
        }

        let leadRef = leadCache.get(accountKey);
        if (!leadRef && account) {
          const companyLeads = await transaction.select({ id: leads.id, personId: leads.personId }).from(leads)
            .where(and(eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, businessLine.id), eq(leads.accountId, account.id))).limit(2);
          if (companyLeads.length > 1) {
            results.push(new LeadImportRecordResultDto(record.recordType, record.externalId, LEAD_IMPORT_RESULT_STATUS.reviewRequired, null));
            continue;
          }
          const companyLead = companyLeads[0];
          if (companyLead) {
            leadRef = { id: companyLead.id, primaryPersonId: companyLead.personId };
            leadCache.set(accountKey, leadRef);
          }
        }

        const cachedPersonIds = [...new Set(contactKeys.map((key) => personCache.get(key)).filter((value): value is string => Boolean(value)))];
        if (cachedPersonIds.length > 1) {
          results.push(new LeadImportRecordResultDto(record.recordType, record.externalId, LEAD_IMPORT_RESULT_STATUS.reviewRequired, null));
          continue;
        }
        const primaryLineLead = exists(transaction.select({ id: leads.id }).from(leads)
          .where(and(eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, businessLine.id), eq(leads.personId, people.id))));
        const linkedLineLead = exists(transaction.select({ id: leadContacts.id }).from(leadContacts)
          .innerJoin(leads, and(eq(leads.id, leadContacts.leadId), eq(leads.organizationId, leadContacts.organizationId)))
          .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.personId, people.id), eq(leads.businessLineId, businessLine.id))));
        const personMatches = await transaction.select({ id: people.id }).from(people).where(and(eq(people.organizationId, input.organizationId), or(
          ...(email ? [sql<boolean>`lower(trim(coalesce(${people.email}, ''))) = ${email}`] : []),
          ...(phone ? [sql<boolean>`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g') = ${phone}`] : []),
        ), or(primaryLineLead, linkedLineLead))).limit(2);
        const matchedIds = [...new Set([...cachedPersonIds, ...personMatches.map((person) => person.id)])];
        if (matchedIds.length > 1) {
          results.push(new LeadImportRecordResultDto(record.recordType, record.externalId, LEAD_IMPORT_RESULT_STATUS.reviewRequired, null));
          continue;
        }
        let personId = matchedIds[0];
        if (!personId) {
          const [person] = await transaction.insert(people).values({ organizationId: input.organizationId, name: record.contactName, email: record.email ?? null, phone: record.phone ?? null }).returning({ id: people.id });
          personId = person.id;
        }
        for (const key of contactKeys) personCache.set(key, personId);

        if (!account) {
          const [createdAccount] = await transaction.insert(accounts).values({ organizationId: input.organizationId, name: record.accountName }).returning({ id: accounts.id });
          account = { id: createdAccount.id, ambiguous: false };
          accountCache.set(accountKey, account);
        }

        const isNewLead = !leadRef;
        if (!leadRef) {
          const [lead] = await transaction.insert(leads).values({ organizationId: input.organizationId, businessLineId: businessLine.id, accountId: account.id, personId, createdByUserId: input.userId, source: LEAD_SOURCE.import, status: LEAD_STATUS.new }).returning({ id: leads.id });
          leadRef = { id: lead.id, primaryPersonId: personId };
          leadCache.set(accountKey, leadRef);
          await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: leadRef.id, fromStatus: null, toStatus: LEAD_STATUS.new, changedByUserId: input.userId });
        }
        const contactLink = await transaction.select({ id: leadContacts.id }).from(leadContacts)
          .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, leadRef.id), eq(leadContacts.personId, personId))).limit(1);
        const [primaryContact] = await transaction.select({ id: leadContacts.id }).from(leadContacts)
          .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.leadId, leadRef.id), eq(leadContacts.isPrimary, true))).limit(1);
        const isPrimary = isNewLead || (!primaryContact && !leadRef.primaryPersonId);
        if (!contactLink.length) await transaction.insert(leadContacts).values({ organizationId: input.organizationId, leadId: leadRef.id, personId, isPrimary, isInterested: false, createdByUserId: input.userId });
        else if (isPrimary) await transaction.update(leadContacts).set({ isPrimary: true, updatedAt: new Date() }).where(and(eq(leadContacts.id, contactLink[0].id), eq(leadContacts.organizationId, input.organizationId)));
        if (isPrimary && !isNewLead) {
          await transaction.update(leads).set({ personId, updatedAt: new Date() }).where(and(eq(leads.id, leadRef.id), eq(leads.organizationId, input.organizationId)));
          leadRef.primaryPersonId = personId;
        }
        await transaction.insert(externalRecords).values({ organizationId: input.organizationId, provider: input.input.provider, recordType: record.recordType, externalId: record.externalId, leadId: leadRef.id, payloadHash: createHash('sha256').update(JSON.stringify(record)).digest('hex') });
        await transaction.insert(auditEvents).values({ organizationId: input.organizationId, actorUserId: input.userId, actorType: 'user', action: isNewLead ? LEAD_IMPORT_AUDIT_ACTION.leadCreated : LEAD_IMPORT_AUDIT_ACTION.contactAdded, entityType: 'lead', entityId: leadRef.id, correlationId: input.correlationId, afterState: { provider: input.input.provider, recordType: record.recordType, source: LEAD_SOURCE.import, contactLinked: !contactLink.length } });
        for (const key of contactKeys) seenContacts.add(key);
        results.push(new LeadImportRecordResultDto(record.recordType, record.externalId, LEAD_IMPORT_RESULT_STATUS.imported, leadRef.id));
      }
      return results;
    });
    if (records === 'business_line_unavailable') return records;
    return new ImportLeadsResultDto(input.input.provider, records);
  }

  async preview(input: ImportRepositoryPreviewDto): Promise<ImportsPreviewDto | 'business_line_unavailable'> {
    const [businessLine] = await database.select({ id: businessLines.id }).from(businessLines)
      .where(and(eq(businessLines.organizationId, input.organizationId), input.input.businessLineId ? eq(businessLines.id, input.input.businessLineId) : eq(businessLines.isDefault, true), eq(businessLines.status, 'active'))).limit(1);
    if (!businessLine) return 'business_line_unavailable';
    if (!input.canManageAll) {
      const [lineMembership] = await database.select({ memberId: businessLineMembers.memberId }).from(businessLineMembers)
        .innerJoin(authMember, and(eq(authMember.id, businessLineMembers.memberId), eq(authMember.organizationId, businessLineMembers.organizationId)))
        .where(and(eq(businessLineMembers.organizationId, input.organizationId), eq(businessLineMembers.businessLineId, businessLine.id), eq(authMember.userId, input.userId))).limit(1);
      if (!lineMembership) return 'business_line_unavailable';
    }
    const recordTypes = unique(input.input.records.map((record) => record.recordType));
    const externalIds = unique(input.input.records.map((record) => record.externalId));
    const [externalRows, accountRows, personRows, leadRows, opportunityRows] = await Promise.all([
      database.select({ recordType: externalRecords.recordType, externalId: externalRecords.externalId, accountId: externalRecords.accountId, personId: externalRecords.personId, leadId: externalRecords.leadId, opportunityId: externalRecords.opportunityId })
        .from(externalRecords).where(and(eq(externalRecords.organizationId, input.organizationId), eq(externalRecords.provider, input.input.provider), inArray(externalRecords.recordType, recordTypes), inArray(externalRecords.externalId, externalIds))),
      this.findAccounts(input),
      this.findPeople(input, businessLine.id),
      this.findLeads(input, businessLine.id),
      this.findOpportunities(input, businessLine.id),
    ]);
    const linkedLeadIds = unique(externalRows.map((row) => row.leadId).filter((id): id is string => Boolean(id)));
    const visibleLinkedLeads = linkedLeadIds.length ? await database.select({ id: leads.id }).from(leads)
      .where(and(eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, businessLine.id), inArray(leads.id, linkedLeadIds))) : [];
    const visibleLinkedLeadIds = new Set(visibleLinkedLeads.map((lead) => lead.id));
    const visibleLinkedPersonIds = new Set(personRows.map((person) => person.id));
    const visibleLinkedOpportunityIds = new Set(opportunityRows.map((opportunity) => opportunity.id));
    const externalMap = new Map(externalRows.map((row) => {
      const target = row.leadId ? visibleLinkedLeadIds.has(row.leadId) ? { targetType: 'lead' as const, targetId: row.leadId } : null : row.accountId ? { targetType: 'account' as const, targetId: row.accountId } : row.personId ? visibleLinkedPersonIds.has(row.personId) ? { targetType: 'person' as const, targetId: row.personId } : null : row.opportunityId ? visibleLinkedOpportunityIds.has(row.opportunityId) ? { targetType: 'opportunity' as const, targetId: row.opportunityId } : null : null;
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

  private async findPeople(input: ImportRepositoryPreviewDto, businessLineId: string) {
    const records = input.input.records.filter((record) => record.targetType === IMPORT_TARGET_TYPE.person || record.targetType === IMPORT_TARGET_TYPE.lead);
    const emails = unique(records.map((record) => normalizedEmail(record.email)));
    const phones = unique(records.map((record) => normalizedPhone(record.phone)));
    const matches = [];
    if (emails.length) matches.push(inArray(sql<string>`lower(trim(coalesce(${people.email}, '')))`, emails));
    if (phones.length) matches.push(inArray(sql<string>`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g')`, phones));
    if (!matches.length) return [];
    const primaryLead = exists(database.select({ id: leads.id }).from(leads)
      .where(and(eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, businessLineId), eq(leads.personId, people.id))));
    const linkedLeadContact = exists(database.select({ id: leadContacts.id }).from(leadContacts)
      .innerJoin(leads, and(eq(leads.id, leadContacts.leadId), eq(leads.organizationId, leadContacts.organizationId)))
      .where(and(eq(leadContacts.organizationId, input.organizationId), eq(leadContacts.personId, people.id), eq(leads.businessLineId, businessLineId))));
    return database.select({ id: people.id, name: people.name, email: people.email, phone: people.phone, normalizedEmail: sql<string>`lower(trim(coalesce(${people.email}, '')))`, normalizedPhone: sql<string>`regexp_replace(coalesce(${people.phone}, ''), '[^0-9]', '', 'g')` })
      .from(people).where(and(eq(people.organizationId, input.organizationId), or(...matches), or(primaryLead, linkedLeadContact)));
  }

  private async findLeads(input: ImportRepositoryPreviewDto, businessLineId: string) {
    const records = input.input.records.filter((record) => record.targetType === IMPORT_TARGET_TYPE.lead);
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
      .where(and(eq(leads.organizationId, input.organizationId), eq(leads.businessLineId, businessLineId), or(...matches)));
  }

  private async findOpportunities(input: ImportRepositoryPreviewDto, businessLineId: string) {
    const names = unique(input.input.records.filter((record) => record.targetType === 'opportunity').map((record) => normalizedName(record.accountName)));
    if (!names.length) return [];
    return database.select({ id: opportunities.id, name: opportunities.name, accountName: accounts.name, normalizedName: sql<string>`lower(trim(${accounts.name}))` })
      .from(opportunities).innerJoin(accounts, and(eq(accounts.id, opportunities.accountId), eq(accounts.organizationId, opportunities.organizationId)))
      .innerJoin(leads, and(eq(leads.id, opportunities.leadId), eq(leads.organizationId, opportunities.organizationId)))
      .where(and(eq(opportunities.organizationId, input.organizationId), eq(leads.businessLineId, businessLineId), inArray(sql<string>`lower(trim(${accounts.name}))`, names)));
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
      const status = existing.targetType === record.targetType ? IMPORT_PREVIEW_STATUS.alreadyLinked : IMPORT_PREVIEW_STATUS.typeConflict;
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
    if (record.targetType === IMPORT_TARGET_TYPE.account) {
      for (const account of accountRows) if (account.normalizedName === accountName) addCandidate('account', account.id, account.name, ['account_name']);
    }
    if (record.targetType === IMPORT_TARGET_TYPE.person) {
      for (const person of personRows) {
        const matchedBy: ImportMatchField[] = [];
        if (email && person.normalizedEmail === email) matchedBy.push('email');
        if (phone && person.normalizedPhone === phone) matchedBy.push('phone');
        if (matchedBy.length) addCandidate('person', person.id, person.name, matchedBy);
      }
    }
    if (record.targetType === IMPORT_TARGET_TYPE.lead) {
      for (const lead of leadRows) {
        const matchedBy: ImportMatchField[] = [];
        if (email && lead.normalizedEmail === email) matchedBy.push('email');
        if (phone && lead.normalizedPhone === phone) matchedBy.push('phone');
        if (matchedBy.length) addCandidate('lead', lead.id, `${lead.accountName} — ${lead.contactName}`, matchedBy);
      }
    }
    if (record.targetType === IMPORT_TARGET_TYPE.opportunity) {
      for (const opportunity of opportunityRows) if (opportunity.normalizedName === accountName) addCandidate('opportunity', opportunity.id, `${opportunity.accountName} — ${opportunity.name}`, ['account_name']);
    }
    const candidateList = [...candidates.values()];
    const status = candidateList.length > 1 ? IMPORT_PREVIEW_STATUS.ambiguous : candidateList.length === 1 ? IMPORT_PREVIEW_STATUS.possibleMatch : IMPORT_PREVIEW_STATUS.noMatch;
    return new ImportPreviewRecordResultDto(record.recordType, record.externalId, record.targetType, record.sourceStatus ?? null, status, null, candidateList);
  }
}
