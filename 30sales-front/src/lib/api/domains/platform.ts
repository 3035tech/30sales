import { PLATFORM_ORGANIZATION_API_PATH } from '../../authorizationConstants';
import { request } from '../request';
import { type CreatePlatformOrganizationInput, type SavePlatformEvolutionConfigurationInput, platformAuditEventListSchema, platformEvolutionConfigurationSchema, platformEvolutionConnectionCheckSchema, platformOrganizationAccessSchema, platformOrganizationCreateSchema, platformOrganizationPageSchema } from '../contracts';


export const platformApi = {
    evolutionConfiguration: () => request(`${PLATFORM_ORGANIZATION_API_PATH}/integrations/evolution`, platformEvolutionConfigurationSchema),
    evolutionAudit: () => request(`${PLATFORM_ORGANIZATION_API_PATH}/integrations/evolution/audit?limit=10`, platformAuditEventListSchema),
    saveEvolutionConfiguration: (input: SavePlatformEvolutionConfigurationInput) => request(`${PLATFORM_ORGANIZATION_API_PATH}/integrations/evolution`, platformEvolutionConfigurationSchema, { method: 'PUT', body: JSON.stringify(input) }),
    checkEvolutionConfiguration: () => request(`${PLATFORM_ORGANIZATION_API_PATH}/integrations/evolution/check`, platformEvolutionConnectionCheckSchema, { method: 'POST' }),
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
