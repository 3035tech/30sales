import { PLATFORM_API_PATH, PLATFORM_ORGANIZATION_API_PATH } from '../../authorizationConstants';
import { request } from '../request';
import { type CheckPlatformEvolutionConnectionInput, type CreatePlatformOrganizationInput, type SavePlatformEvolutionConfigurationInput, platformAiUsageSchema, platformAuditEventListSchema, platformEvolutionConfigurationSchema, platformEvolutionConnectionCheckSchema, platformOrganizationAccessSchema, platformOrganizationCreateSchema, platformOrganizationPageSchema } from '../contracts';


export const platformApi = {
    aiUsage: (params: { from: string; to: string; limit?: number; offset?: number }) => {
      const search = new URLSearchParams({ from: params.from, to: params.to });
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`${PLATFORM_API_PATH}/ai-usage?${search.toString()}`, platformAiUsageSchema);
    },
    evolutionConfiguration: () => request(`${PLATFORM_ORGANIZATION_API_PATH}/integrations/evolution`, platformEvolutionConfigurationSchema),
    evolutionAudit: () => request(`${PLATFORM_ORGANIZATION_API_PATH}/integrations/evolution/audit?limit=10`, platformAuditEventListSchema),
    saveEvolutionConfiguration: (input: SavePlatformEvolutionConfigurationInput) => request(`${PLATFORM_ORGANIZATION_API_PATH}/integrations/evolution`, platformEvolutionConfigurationSchema, { method: 'PUT', body: JSON.stringify(input) }),
    checkEvolutionConfiguration: (input: CheckPlatformEvolutionConnectionInput = {}) => request(`${PLATFORM_ORGANIZATION_API_PATH}/integrations/evolution/check`, platformEvolutionConnectionCheckSchema, { method: 'POST', body: JSON.stringify(input) }),
    organizations: (params: { search?: string; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.search) search.set('search', params.search);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`${PLATFORM_ORGANIZATION_API_PATH}?${search.toString()}`, platformOrganizationPageSchema);
    },
    createOrganization: (input: CreatePlatformOrganizationInput) => request(PLATFORM_ORGANIZATION_API_PATH, platformOrganizationCreateSchema, { method: 'POST', body: JSON.stringify(input) }),
    accessOrganization: (organizationId: string) => request(`${PLATFORM_ORGANIZATION_API_PATH}/${encodeURIComponent(organizationId)}/access`, platformOrganizationAccessSchema, { method: 'POST' }),
  };
