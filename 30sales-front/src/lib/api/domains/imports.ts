import { IMPORT_PROVIDERS, IMPORT_TARGET_TYPE, IMPORT_TARGET_TYPES } from '../../importConstants';
import { request } from '../request';
import { importsLeadsResultSchema, importsPreviewSchema } from '../contracts';


export const importsApi = {
    preview: (input: { provider: (typeof IMPORT_PROVIDERS)[number]; records: Array<{ recordType: string; externalId: string; targetType: (typeof IMPORT_TARGET_TYPES)[number]; accountName?: string; contactName?: string; email?: string; phone?: string; sourceStatus?: string }> }) => request('/api/v1/imports/reconciliation-preview', importsPreviewSchema, { method: 'POST', body: JSON.stringify(input) }),
    importLeads: (input: { provider: (typeof IMPORT_PROVIDERS)[number]; records: Array<{ recordType: string; externalId: string; targetType: typeof IMPORT_TARGET_TYPE.lead; accountName: string; contactName: string; email?: string; phone?: string; sourceStatus?: string }> }) => request('/api/v1/imports/leads/commit', importsLeadsResultSchema, { method: 'POST', body: JSON.stringify(input) }),
  };
