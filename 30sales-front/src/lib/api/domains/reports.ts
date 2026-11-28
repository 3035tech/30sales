import { request } from '../request';
import { aiUsageReportSchema, dailyActivityReportSchema, funnelReportSchema } from '../contracts';


export const reportsApi = {
    funnel: (from: string, to: string, businessLineId?: string) => request(`/api/v1/reports/funnel?${new URLSearchParams({ from, to, ...(businessLineId ? { businessLineId } : {}) })}`, funnelReportSchema),
    aiUsage: (from: string, to: string, businessLineId?: string) => request(`/api/v1/reports/ai-usage?${new URLSearchParams({ from, to, ...(businessLineId ? { businessLineId } : {}) })}`, aiUsageReportSchema),
    dailyActivity: (scope: 'mine' | 'team', date?: string, businessLineId?: string) => request(`/api/v1/reports/daily-activity?${new URLSearchParams({ scope, ...(date ? { date } : {}), ...(businessLineId ? { businessLineId } : {}) })}`, dailyActivityReportSchema),
  };
