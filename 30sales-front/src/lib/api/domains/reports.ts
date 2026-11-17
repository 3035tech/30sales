import { request } from '../request';
import { aiUsageReportSchema, funnelReportSchema } from '../contracts';


export const reportsApi = {
    funnel: (from: string, to: string) => request(`/api/v1/reports/funnel?${new URLSearchParams({ from, to })}`, funnelReportSchema),
    aiUsage: (from: string, to: string) => request(`/api/v1/reports/ai-usage?${new URLSearchParams({ from, to })}`, aiUsageReportSchema),
  };
