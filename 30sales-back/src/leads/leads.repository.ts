import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { database } from '../db';
import { accounts, leadStatusHistory, leads, people } from '../db/schema';
import { LeadRecordDto, LeadRepositoryCreateDto, LeadRepositoryFindDto, LeadRepositoryListDto, LeadRepositoryStatusChangeDto } from './leads.dto';

function mapLead(row: { leadId: string; accountName: string; contactName: string; email: string | null; phone: string | null; source: string; status: LeadRecordDto['status']; nextActionAt: Date | null; createdAt: Date; updatedAt: Date }): LeadRecordDto {
  return new LeadRecordDto(row.leadId, row.accountName, row.contactName, row.email, row.phone, row.source, row.status, row.nextActionAt?.toISOString() ?? null, row.createdAt.toISOString(), row.updatedAt.toISOString());
}
@Injectable()
export class LeadsRepository {
  async list(input: LeadRepositoryListDto): Promise<LeadRecordDto[]> {
    const rows = await database.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .where(input.query.status ? and(eq(leads.organizationId, input.organizationId), eq(leads.status, input.query.status)) : eq(leads.organizationId, input.organizationId))
      .orderBy(asc(leads.nextActionAt), desc(leads.createdAt)).limit(input.query.limit).offset(input.query.offset);
    return rows.map(mapLead);
  }
  async create(input: LeadRepositoryCreateDto): Promise<LeadRecordDto> {
    return database.transaction(async (transaction) => {
      const [account] = await transaction.insert(accounts).values({ organizationId: input.organizationId, name: input.accountName }).returning();
      const [person] = await transaction.insert(people).values({ organizationId: input.organizationId, name: input.contactName, email: input.email, phone: input.phone }).returning();
      const [lead] = await transaction.insert(leads).values({ organizationId: input.organizationId, accountId: account.id, personId: person.id, createdByUserId: input.createdByUserId, source: input.source, status: 'new' }).returning();
      await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: lead.id, fromStatus: null, toStatus: 'new', changedByUserId: input.createdByUserId });
      return mapLead({ leadId: lead.id, accountName: account.name, contactName: person.name, email: person.email, phone: person.phone, source: lead.source, status: lead.status, nextActionAt: lead.nextActionAt, createdAt: lead.createdAt, updatedAt: lead.updatedAt });
    });
  }
  async findById(input: LeadRepositoryFindDto): Promise<LeadRecordDto | null> {
    const [row] = await database.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt }).from(leads)
      .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
      .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
      .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
    return row ? mapLead(row) : null;
  }
  async updateStatus(input: LeadRepositoryStatusChangeDto): Promise<LeadRecordDto | null> {
    return database.transaction(async (transaction) => {
      const [updated] = await transaction.update(leads).set({ status: input.status, updatedAt: new Date() })
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId), eq(leads.status, input.expectedStatus))).returning();
      if (!updated) return null;
      await transaction.insert(leadStatusHistory).values({ organizationId: input.organizationId, leadId: input.leadId, fromStatus: input.expectedStatus, toStatus: input.status, changedByUserId: input.changedByUserId });
      const [row] = await transaction.select({ leadId: leads.id, accountName: accounts.name, contactName: people.name, email: people.email, phone: people.phone, source: leads.source, status: leads.status, nextActionAt: leads.nextActionAt, createdAt: leads.createdAt, updatedAt: leads.updatedAt }).from(leads)
        .innerJoin(accounts, and(eq(accounts.id, leads.accountId), eq(accounts.organizationId, leads.organizationId)))
        .innerJoin(people, and(eq(people.id, leads.personId), eq(people.organizationId, leads.organizationId)))
        .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId))).limit(1);
      return row ? mapLead(row) : null;
    });
  }
}
