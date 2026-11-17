import { request } from '../request';
import { z } from 'zod';
import { userNotificationsPageSchema } from '../contracts';


export const notificationsApi = {
    list: (limit = 20) => request(`/api/v1/notifications?limit=${limit}`, userNotificationsPageSchema),
    markRead: (notificationId: string) => request(`/api/v1/notifications/${encodeURIComponent(notificationId)}/read`, z.object({ id: z.string().uuid(), read: z.literal(true) }), { method: 'PATCH' }),
    markAllRead: () => request('/api/v1/notifications/read-all', z.object({ read: z.literal(true) }), { method: 'POST' }),
  };
