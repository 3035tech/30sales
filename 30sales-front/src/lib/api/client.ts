import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { z } from 'zod';
import { access, roles, type OrganizationRole } from '../permissions';

const authClient = createAuthClient({ baseURL: import.meta.env.VITE_API_URL ?? '', plugins: [organizationClient({ ac: access, roles })] });
const leadStatus = z.enum(['new','researching','ready','queued','contacting','responded','converted_to_sdr','invalid_contact','no_channel','out_of_profile','duplicate_review','no_response','paused','do_not_contact']);
const leadSchema = z.object({ id: z.string().uuid(), accountName: z.string(), contactName: z.string(), email: z.string().nullable(), phone: z.string().nullable(), source: z.string(), status: leadStatus, nextActionAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string() });
const sessionSchema = z.object({ user: z.object({ id: z.string(), name: z.string(), email: z.string() }), activeOrganizationId: z.string().nullable(), organizations: z.array(z.object({ id: z.string(), name: z.string(), slug: z.string() })) });
const memberSchema = z.object({ id: z.string(), role: z.string(), user: z.object({ name: z.string(), email: z.string() }) });
const invitationSchema = z.object({ id: z.string(), email: z.string(), role: z.string(), organizationName: z.string().optional(), organization: z.object({ name: z.string() }).optional() }).passthrough();
export type LeadStatus = z.infer<typeof leadStatus>;
export function parseLeadStatus(value: string): LeadStatus | null { const parsed = leadStatus.safeParse(value); return parsed.success ? parsed.data : null; }
export type LeadDto = z.infer<typeof leadSchema>;
export type CreateLeadInput = { accountName: string; contactName: string; email?: string; phone?: string; source?: 'manual' | 'import' | 'whatsapp' | 'referral' };
export type SessionDto = z.infer<typeof sessionSchema>;
export type TeamMemberDto = z.infer<typeof memberSchema>;
export type InvitationDto = z.infer<typeof invitationSchema>;
export class ApiError extends Error { readonly status: number; readonly code: string; constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; this.name = 'ApiError'; } }

async function request<T>(path: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('accept', 'application/json');
  headers.set('x-request-id', crypto.randomUUID());
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? ''}${path}`, { ...init, headers, credentials: 'include' });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const errorSchema = z.object({ code: z.string().optional(), message: z.string().optional(), error: z.string().optional() }).passthrough();
    const parsedError = errorSchema.safeParse(payload);
    throw new ApiError(response.status, parsedError.success ? parsedError.data.code ?? 'REQUEST_FAILED' : 'REQUEST_FAILED', parsedError.success ? parsedError.data.message ?? parsedError.data.error ?? 'The request could not be completed.' : 'The request could not be completed.');
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new ApiError(502, 'INVALID_API_RESPONSE', 'O servidor retornou uma resposta inesperada.');
  return parsed.data;
}

function authError(result: { error?: { message?: string } | null }): { message: string } | null {
  return result.error ? { message: result.error.message ?? 'The request could not be completed.' } : null;
}

export const api = {
  session: { get: () => request('/api/v1/session', sessionSchema) },
  leads: {
    list: (params: { status?: LeadStatus; limit?: number; offset?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.status) search.set('status', params.status);
      if (params.limit !== undefined) search.set('limit', String(params.limit));
      if (params.offset !== undefined) search.set('offset', String(params.offset));
      return request(`/api/v1/leads?${search.toString()}`, z.array(leadSchema));
    },
    create: (input: CreateLeadInput) => request('/api/v1/leads', leadSchema, { method: 'POST', body: JSON.stringify(input) }),
    updateStatus: (id: string, status: LeadStatus) => request(`/api/v1/leads/${encodeURIComponent(id)}/status`, leadSchema, { method: 'PATCH', body: JSON.stringify({ status }) }),
  },
  team: {
    async listMembers(organizationId: string): Promise<{ data: TeamMemberDto[] | null; error: { message: string } | null }> {
      const result = await authClient.organization.listMembers({ query: { organizationId, limit: 100 } });
      const error = authError(result);
      if (error || !result.data) return { data: null, error: error ?? { message: 'The team could not be loaded.' } };
      const parsed = z.object({ members: z.array(memberSchema) }).safeParse(result.data);
      return parsed.success ? { data: parsed.data.members, error: null } : { data: null, error: { message: 'The member response is invalid.' } };
    },
    async invite(input: { organizationId: string; email: string; role: OrganizationRole }): Promise<{ error: { message: string } | null }> {
      const result = await authClient.organization.inviteMember({ ...input, resend: true });
      return { error: authError(result) };
    },
  },
  auth: {
    setActiveOrganization: (organizationId: string) => authClient.organization.setActive({ organizationId }),
    signInEmail: (input: { email: string; password: string; callbackURL?: string }) => authClient.signIn.email(input),
    signUpEmail: (input: { name: string; email: string; password: string; callbackURL?: string }) => authClient.signUp.email(input),
    getSession: () => authClient.getSession(),
    async getInvitation(id: string): Promise<{ data: InvitationDto | null; error: { message: string } | null }> {
      const result = await authClient.organization.getInvitation({ query: { id } });
      const error = authError(result);
      if (error || !result.data) return { data: null, error: error ?? { message: 'Invitation is unavailable.' } };
      const parsed = invitationSchema.safeParse(result.data);
      return parsed.success ? { data: parsed.data, error: null } : { data: null, error: { message: 'Invitation response is invalid.' } };
    },
    acceptInvitation: (invitationId: string) => authClient.organization.acceptInvitation({ invitationId }),
  },
};
