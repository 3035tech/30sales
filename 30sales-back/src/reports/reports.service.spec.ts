import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApiRequestDto } from '../common/api-request.dto';
import type { TenantAccessService } from '../leads/tenant-access.service';
import { AiUsageReportDto, FunnelReportQueryDto, FunnelReportRepositoryQueryDto } from './reports.dto';
import type { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';

jest.mock('../leads/tenant-access.service', () => ({ TenantAccessService: class TenantAccessService {} }));
jest.mock('./reports.repository', () => ({ ReportsRepository: class ReportsRepository {} }));

describe('ReportsService business-line access', () => {
  const organizationId = '10000000-0000-4000-8000-000000000001';
  const userId = '20000000-0000-4000-8000-000000000001';
  const allowedLineId = '30000000-0000-4000-8000-000000000001';
  const otherLineId = '30000000-0000-4000-8000-000000000002';
  const request = new ApiRequestDto({});
  const query: FunnelReportQueryDto = { from: '2026-11-01', to: '2026-11-19' };
  const tenantAccess = { require: jest.fn() } as unknown as TenantAccessService;
  const repository = {
    listAccessibleBusinessLineIds: jest.fn(),
    isActiveBusinessLine: jest.fn(),
    aiUsage: jest.fn(),
    funnel: jest.fn(),
  } as unknown as ReportsRepository;
  const service = new ReportsService(tenantAccess, repository);

  beforeEach(() => {
    tenantAccess.require = jest.fn().mockResolvedValue({ organizationId, userId, role: 'analyst' });
    repository.listAccessibleBusinessLineIds = jest.fn().mockResolvedValue([allowedLineId]);
    repository.isActiveBusinessLine = jest.fn();
    repository.aiUsage = jest.fn().mockImplementation(async (input: FunnelReportRepositoryQueryDto) => new AiUsageReportDto(input.query.from, input.query.to, [], '2026-11-19T12:00:00.000Z'));
    repository.funnel = jest.fn();
  });

  it('limits an analyst report to the business lines they belong to', async () => {
    await service.aiUsage(request, { ...query, businessLineId: allowedLineId });

    expect(repository.aiUsage).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      businessLineIds: [allowedLineId],
    }));
    expect(repository.isActiveBusinessLine).not.toHaveBeenCalled();
  });

  it('rejects a report for a business line outside the analyst membership', async () => {
    await expect(service.aiUsage(request, { ...query, businessLineId: otherLineId }))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.aiUsage).not.toHaveBeenCalled();
  });

  it('returns an empty scope when an analyst has no active business-line memberships', async () => {
    repository.listAccessibleBusinessLineIds = jest.fn().mockResolvedValue([]);

    await service.aiUsage(request, query);

    expect(repository.aiUsage).toHaveBeenCalledWith(expect.objectContaining({ businessLineIds: [] }));
  });

  it('keeps a manager report consolidated when no business line is selected', async () => {
    tenantAccess.require = jest.fn().mockResolvedValue({ organizationId, userId, role: 'manager' });

    await service.funnel(request, query);

    expect(repository.listAccessibleBusinessLineIds).not.toHaveBeenCalled();
    expect(repository.funnel).toHaveBeenCalledWith(expect.objectContaining({ organizationId, businessLineIds: null }));
  });

  it('validates that a manager-selected business line is active in the current organization', async () => {
    tenantAccess.require = jest.fn().mockResolvedValue({ organizationId, userId, role: 'manager' });
    repository.isActiveBusinessLine = jest.fn().mockResolvedValue(false);

    await expect(service.aiUsage(request, { ...query, businessLineId: otherLineId }))
      .rejects.toBeInstanceOf(BadRequestException);

    expect(repository.aiUsage).not.toHaveBeenCalled();
  });

  it('blocks roles without organization report access before resolving line scope', async () => {
    tenantAccess.require = jest.fn().mockResolvedValue({ organizationId, userId, role: 'sdr' });

    await expect(service.funnel(request, query)).rejects.toBeInstanceOf(ForbiddenException);

    expect(repository.listAccessibleBusinessLineIds).not.toHaveBeenCalled();
    expect(repository.funnel).not.toHaveBeenCalled();
  });
});
