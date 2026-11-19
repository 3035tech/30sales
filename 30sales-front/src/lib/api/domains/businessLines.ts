import { BUSINESS_LINES_API_PATH } from '../../authorizationConstants';
import { request } from '../request';
import { businessLineListSchema, businessLineMembersSchema, businessLineSchema } from '../contracts';

export const businessLinesApi = {
  list: () => request(BUSINESS_LINES_API_PATH, businessLineListSchema),
  create: (input: { name: string; slug: string; description?: string }) => request(BUSINESS_LINES_API_PATH, businessLineSchema, { method: 'POST', body: JSON.stringify(input) }),
  update: (businessLineId: string, input: { name?: string; slug?: string; description?: string; status?: 'active' | 'paused' | 'archived' }) => request(`${BUSINESS_LINES_API_PATH}/${encodeURIComponent(businessLineId)}`, businessLineSchema, { method: 'PATCH', body: JSON.stringify(input) }),
  members: (businessLineId: string) => request(`${BUSINESS_LINES_API_PATH}/${encodeURIComponent(businessLineId)}/members`, businessLineMembersSchema),
  setMembers: (businessLineId: string, memberUserIds: string[]) => request(`${BUSINESS_LINES_API_PATH}/${encodeURIComponent(businessLineId)}/members`, businessLineMembersSchema, { method: 'PUT', body: JSON.stringify({ memberUserIds }) }),
};
