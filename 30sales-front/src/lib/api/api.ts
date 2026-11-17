import { campaignsApi } from './domains/campaigns';
import { sessionApi } from './domains/session';
import { notificationsApi } from './domains/notifications';
import { closerEventsApi } from './domains/closerEvents';
import { inboxApi } from './domains/inbox';
import { agentsApi } from './domains/agents';
import { channelsApi } from './domains/channels';
import { auditApi } from './domains/audit';
import { importsApi } from './domains/imports';
import { leadsApi } from './domains/leads';
import { accountsApi } from './domains/accounts';
import { tasksApi } from './domains/tasks';
import { handoffsApi } from './domains/handoffs';
import { opportunitiesApi } from './domains/opportunities';
import { reportsApi } from './domains/reports';
import { teamApi } from './domains/identity';
import { platformApi } from './domains/platform';
import { authApi } from './domains/identity';

export const api = {
  campaigns: campaignsApi,
  session: sessionApi,
  notifications: notificationsApi,
  closerEvents: closerEventsApi,
  inbox: inboxApi,
  agents: agentsApi,
  channels: channelsApi,
  audit: auditApi,
  imports: importsApi,
  leads: leadsApi,
  accounts: accountsApi,
  tasks: tasksApi,
  handoffs: handoffsApi,
  opportunities: opportunitiesApi,
  reports: reportsApi,
  team: teamApi,
  platform: platformApi,
  auth: authApi,
};
