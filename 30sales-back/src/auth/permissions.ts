import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, ownerAc } from 'better-auth/plugins/organization/access';

const statement = {
 ...defaultStatements,
 leads: ['read', 'create', 'update', 'assign', 'export'],
 pipeline: ['read', 'create', 'update'],
 activities: ['read', 'create', 'update'],
 reports: ['read', 'export'],
 integrations: ['read', 'manage'],
 settings: ['read', 'manage'],
} as const;
export const access = createAccessControl(statement);
const owner = access.newRole({ ...ownerAc.statements, leads: [...statement.leads], pipeline: [...statement.pipeline], activities: [...statement.activities], reports: [...statement.reports], integrations: [...statement.integrations], settings: [...statement.settings] });
const admin = access.newRole({ ...adminAc.statements, leads: [...statement.leads], pipeline: [...statement.pipeline], activities: [...statement.activities], reports: [...statement.reports], integrations: [...statement.integrations], settings: [...statement.settings] });
const manager = access.newRole({ organization: ['update'], member: ['create','update','delete'], invitation: ['create','cancel'], leads: ['read','create','update','assign','export'], pipeline: ['read','create','update'], activities: ['read','create','update'], reports: ['read','export'], integrations: ['read'], settings: ['read'] });
const bdr = access.newRole({ leads: ['read','create','update','assign'], pipeline: ['read','create','update'], activities: ['read','create','update'], reports: ['read'] });
const sdr = access.newRole({ leads: ['read','create','update'], activities: ['read','create','update'], pipeline: ['read','create'], reports: ['read'] });
const closer = access.newRole({ leads: ['read','update'], pipeline: ['read','create','update'], activities: ['read','create','update'], reports: ['read'] });
const operations = access.newRole({ leads: ['read','update','export'], pipeline: ['read'], activities: ['read','create','update'], reports: ['read','export'], integrations: ['read','manage'], settings: ['read'] });
const analyst = access.newRole({ leads: ['read'], pipeline: ['read'], activities: ['read'], reports: ['read','export'] });
export const roles = { owner, admin, manager, bdr, sdr, closer, operations, analyst };
export type OrganizationRole = keyof typeof roles;
