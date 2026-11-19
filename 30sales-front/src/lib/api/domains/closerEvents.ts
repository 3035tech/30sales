import { request } from '../request';
import { z } from 'zod';
import { type CloserEventSlaSettingsDto, closerEventSlaSettingsSchema, closerEventsPageSchema, closerSlaNotificationSchema } from '../contracts';


export const closerEventsApi = {
    list: (params: { businessLineId?: string; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.businessLineId) search.set('businessLineId', params.businessLineId);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/closer-events?${search.toString()}`, closerEventsPageSchema);
    },
    assignees: () => request('/api/v1/closer-events/assignees', z.array(z.object({ id: z.string().uuid(), name: z.string() }))),
    slaSettings: () => request('/api/v1/closer-events/sla-policies', closerEventSlaSettingsSchema),
    saveSlaSettings: (input: { policies: CloserEventSlaSettingsDto['policies'] }) => request('/api/v1/closer-events/sla-policies', closerEventSlaSettingsSchema, { method: 'PUT', body: JSON.stringify(input) }),
    slaNotifications: (limit = 20) => request(`/api/v1/closer-events/sla-notifications?limit=${limit}`, z.array(closerSlaNotificationSchema)),
    readSlaNotification: (notificationId: string) => request(`/api/v1/closer-events/sla-notifications/${encodeURIComponent(notificationId)}/read`, z.object({ id: z.string().uuid(), read: z.literal(true) }), { method: 'PATCH' }),
    act: (eventId: string, input: { action: 'acknowledge' | 'snooze' | 'reassign' | 'resolve'; snoozedUntil?: string; assignedToUserId?: string }) => request(`/api/v1/closer-events/${encodeURIComponent(eventId)}/actions`, z.object({ id: z.string().uuid(), status: z.string(), assignedToUserId: z.string().uuid(), acknowledgedAt: z.string().nullable(), snoozedUntil: z.string().nullable(), resolvedAt: z.string().nullable() }), { method: 'PATCH', body: JSON.stringify(input) }),
  };
