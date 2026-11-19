import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORGANIZATION_ROLE } from '../auth/authorization.constants';
import { ApiRequestDto } from '../common/api-request.dto';
import { TenantContextDto } from '../leads/leads.dto';
import { TenantAccessService } from '../leads/tenant-access.service';
import { BusinessLinesRepository } from './business-lines.repository';
import { BusinessLineListDto, BusinessLineRecordDto, createBusinessLineSchema } from './business-lines.dto';
import { BusinessLinesService } from './business-lines.service';

jest.mock('../leads/tenant-access.service', () => ({ TenantAccessService: class TenantAccessService {} }));
jest.mock('./business-lines.repository', () => ({ BusinessLinesRepository: class BusinessLinesRepository {} }));

describe('BusinessLinesService', () => {
  const organizationId = '85422000-0000-4000-8000-000000000001';
  const userId = '85422000-0000-4000-8000-000000000002';
  const businessLineId = '85422000-0000-4000-8000-000000000003';
  const request = new ApiRequestDto({ 'x-correlation-id': 'business-lines-test' });

  let service: BusinessLinesService;
  let tenantAccess: jest.Mocked<TenantAccessService>;
  let repository: jest.Mocked<BusinessLinesRepository>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BusinessLinesService,
        {
          provide: TenantAccessService,
          useValue: { require: jest.fn() },
        },
        {
          provide: BusinessLinesRepository,
          useValue: {
            list: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            listMembers: jest.fn(),
            setMembers: jest.fn(),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(BusinessLinesService);
    tenantAccess = moduleRef.get(TenantAccessService);
    repository = moduleRef.get(BusinessLinesRepository);
  });

  it('lists all lines for organization managers using the resolved tenant context', async () => {
    const context = new TenantContextDto(userId, organizationId, ORGANIZATION_ROLE.manager);
    const result = new BusinessLineListDto([]);
    tenantAccess.require.mockResolvedValue(context);
    repository.list.mockResolvedValue(result);

    await expect(service.list(request)).resolves.toBe(result);

    expect(tenantAccess.require).toHaveBeenCalledWith(request, 'read', 'pipeline');
    expect(repository.list).toHaveBeenCalledWith(organizationId, userId, true);
  });

  it('limits regular members to the lines granted by repository membership', async () => {
    const context = new TenantContextDto(userId, organizationId, ORGANIZATION_ROLE.sdr);
    tenantAccess.require.mockResolvedValue(context);
    repository.list.mockResolvedValue(new BusinessLineListDto([]));

    await service.list(request);

    expect(repository.list).toHaveBeenCalledWith(organizationId, userId, false);
  });

  it('does not let non-managers create business lines', async () => {
    tenantAccess.require.mockResolvedValue(new TenantContextDto(userId, organizationId, ORGANIZATION_ROLE.sdr));
    const input = createBusinessLineSchema.parse({ name: '30Pay', slug: '30pay' });

    await expect(service.create(request, input)).rejects.toBeInstanceOf(ForbiddenException);

    expect(tenantAccess.require).toHaveBeenCalledWith(request, 'update', 'leads');
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('derives tenant and actor identity from the authorized context when creating a line', async () => {
    const context = new TenantContextDto(userId, organizationId, ORGANIZATION_ROLE.owner);
    const input = createBusinessLineSchema.parse({ name: '30Pay', slug: '30pay' });
    const result = new BusinessLineRecordDto(businessLineId, input.name, input.slug, null, 'active', true, 1, '2026-11-19T00:00:00.000Z');
    tenantAccess.require.mockResolvedValue(context);
    repository.create.mockResolvedValue(result);

    await expect(service.create(request, input)).resolves.toBe(result);

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      organizationId,
      actorUserId: userId,
      input,
      correlationId: request.correlationId,
    }));
  });

  it('scopes direct updates to the active organization and hides cross-tenant lines', async () => {
    tenantAccess.require.mockResolvedValue(new TenantContextDto(userId, organizationId, ORGANIZATION_ROLE.admin));
    repository.update.mockResolvedValue('not_found');

    await expect(service.update(request, businessLineId, { name: 'Other tenant' })).rejects.toBeInstanceOf(NotFoundException);

    expect(repository.update).toHaveBeenCalledWith(expect.objectContaining({ organizationId, businessLineId }));
  });

  it('rejects adding users who do not belong to the active organization', async () => {
    tenantAccess.require.mockResolvedValue(new TenantContextDto(userId, organizationId, ORGANIZATION_ROLE.owner));
    repository.setMembers.mockResolvedValue('invalid_members');

    await expect(service.setMembers(request, businessLineId, { memberUserIds: [userId] })).rejects.toMatchObject({
      status: 422,
      response: expect.objectContaining({ code: 'BUSINESS_LINE_MEMBERS_INVALID' }),
    });

    expect(repository.setMembers).toHaveBeenCalledWith(expect.objectContaining({ organizationId, businessLineId, memberUserIds: [userId] }));
  });
});
