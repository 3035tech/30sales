import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements, ownerAc } from 'better-auth/plugins/organization/access';
import { ORGANIZATION_ROLE } from './authorization.constants';

const statement = {
 ...defaultStatements,
 leads: ['read', 'create', 'update', 'assign', 'export'],
 pipeline: ['read', 'create', 'update'],
 activities: ['read', 'create', 'update'],
 inbox: ['read', 'assign'],
 audit: ['read'],
 reports: ['read', 'export'],
 integrations: ['read', 'manage'],
 settings: ['read', 'manage'],
} as const;
export const access = createAccessControl(statement);
const owner = access.newRole({ ...ownerAc.statements, leads: [...statement.leads], inbox: [...statement.inbox], audit: [...statement.audit], pipeline: [...statement.pipeline], activities: [...statement.activities], reports: [...statement.reports], integrations: [...statement.integrations], settings: [...statement.settings] });
const admin = access.newRole({ ...adminAc.statements, leads: [...statement.leads], inbox: [...statement.inbox], audit: [...statement.audit], pipeline: [...statement.pipeline], activities: [...statement.activities], reports: [...statement.reports], integrations: [...statement.integrations], settings: [...statement.settings] });
const manager = access.newRole({ inbox: [...statement.inbox], audit: ['read'], organization: ['update'], member: ['create','update','delete'], invitation: ['create','cancel'], leads: ['read','create','update','assign','export'], pipeline: ['read','create','update'], activities: ['read','create','update'], reports: ['read','export'], integrations: ['read'], settings: ['read'] });
const bdr = access.newRole({ inbox: [...statement.inbox], leads: ['read','create','update','assign'], pipeline: ['read','create','update'], activities: ['read','create','update'], reports: ['read'] });
const sdr = access.newRole({ inbox: [...statement.inbox], leads: ['read','create','update'], activities: ['read','create','update'], pipeline: ['read','create'], reports: ['read'] });
const closer = access.newRole({ inbox: [...statement.inbox], leads: ['read','update'], pipeline: ['read','create','update'], activities: ['read','create','update'], reports: ['read'] });
const operations = access.newRole({ inbox: [...statement.inbox], audit: ['read'], leads: ['read','update','export'], pipeline: ['read'], activities: ['read','create','update'], reports: ['read','export'], integrations: ['read','manage'], settings: ['read'] });
const analyst = access.newRole({ inbox: ['read'], leads: ['read'], pipeline: ['read'], activities: ['read'], reports: ['read','export'] });
export const roles = { [ORGANIZATION_ROLE.owner]: owner, [ORGANIZATION_ROLE.admin]: admin, [ORGANIZATION_ROLE.manager]: manager, [ORGANIZATION_ROLE.bdr]: bdr, [ORGANIZATION_ROLE.sdr]: sdr, [ORGANIZATION_ROLE.closer]: closer, [ORGANIZATION_ROLE.operations]: operations, [ORGANIZATION_ROLE.analyst]: analyst };
export type OrganizationRole = (typeof ORGANIZATION_ROLE)[keyof typeof ORGANIZATION_ROLE];
