import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { z } from 'zod';
import { access, roles, type OrganizationRole } from '../../permissions';
import { memberSchema, invitationSchema, platformOrganizationInvitationResultSchema, platformOrganizationInvitationResendSchema, platformOrganizationMembersSchema, teamInvitationSchema, type TeamMemberDto, type InvitationDto } from '../contracts';
import { apiAuthFetch } from '../client';
import { PLATFORM_ORGANIZATION_API_PATH, PLATFORM_ORGANIZATION_CONTEXT_STORAGE_KEY } from '../../authorizationConstants';
import { request } from '../request';

const authClient = createAuthClient({ baseURL: import.meta.env.VITE_API_URL ?? '', fetchOptions: { customFetchImpl: apiAuthFetch }, plugins: [organizationClient({ ac: access, roles })] });

function authError(result: { error?: { message?: string } | null }): { message: string } | null {
  return result.error ? { message: result.error.message ?? 'The request could not be completed.' } : null;
}

export const teamApi = {
    async listMembers(organizationId: string): Promise<{ data: TeamMemberDto[] | null; error: { message: string } | null }> {
      if (sessionStorage.getItem(PLATFORM_ORGANIZATION_CONTEXT_STORAGE_KEY) === organizationId) {
        try {
          const result = await request(`${PLATFORM_ORGANIZATION_API_PATH}/${encodeURIComponent(organizationId)}/members`, platformOrganizationMembersSchema);
          return { data: result.members, error: null };
        } catch (error) {
          return { data: null, error: { message: error instanceof Error ? error.message : 'The team could not be loaded.' } };
        }
      }
      const result = await authClient.organization.listMembers({ query: { organizationId, limit: 100 } });
      const error = authError(result);
      if (error || !result.data) return { data: null, error: error ?? { message: 'The team could not be loaded.' } };
      const parsed = z.object({ members: z.array(memberSchema) }).safeParse(result.data);
      return parsed.success ? { data: parsed.data.members, error: null } : { data: null, error: { message: 'The member response is invalid.' } };
    },
    async listInvitations(organizationId: string) {
      if (sessionStorage.getItem(PLATFORM_ORGANIZATION_CONTEXT_STORAGE_KEY) === organizationId) {
        try {
          const result = await request(`${PLATFORM_ORGANIZATION_API_PATH}/${encodeURIComponent(organizationId)}/members`, platformOrganizationMembersSchema);
          return { data: result.invitations, error: null };
        } catch (error) {
          return { data: null, error: { message: error instanceof Error ? error.message : 'The invitations could not be loaded.' } };
        }
      }
      const result = await authClient.organization.listInvitations({ query: { organizationId } });
      const error = authError(result);
      if (error || !result.data) return { data: null, error: error ?? { message: 'The invitations could not be loaded.' } };
      const parsed = z.array(teamInvitationSchema).safeParse(result.data);
      return parsed.success ? { data: parsed.data, error: null } : { data: null, error: { message: 'The invitation response is invalid.' } };
    },
    async invite(input: { organizationId: string; email: string; role: OrganizationRole }): Promise<{ error: { message: string } | null; emailSent: boolean }> {
      if (sessionStorage.getItem(PLATFORM_ORGANIZATION_CONTEXT_STORAGE_KEY) === input.organizationId) {
        try {
          const result = await request(`${PLATFORM_ORGANIZATION_API_PATH}/${encodeURIComponent(input.organizationId)}/invitations`, platformOrganizationInvitationResultSchema, { method: 'POST', body: JSON.stringify({ email: input.email, role: input.role }) });
          return { error: null, emailSent: result.emailSent };
        } catch (error) {
          return { error: { message: error instanceof Error ? error.message : 'The invitation could not be sent.' }, emailSent: false };
        }
      }
      const result = await authClient.organization.inviteMember({ ...input, resend: true });
      return { error: authError(result), emailSent: !result.error };
    },
    async resendInvitation(input: { organizationId: string; id: string; email: string; role: OrganizationRole }) {
      if (sessionStorage.getItem(PLATFORM_ORGANIZATION_CONTEXT_STORAGE_KEY) === input.organizationId) {
        try {
          const result = await request(`${PLATFORM_ORGANIZATION_API_PATH}/${encodeURIComponent(input.organizationId)}/invitations/${encodeURIComponent(input.id)}/resend`, platformOrganizationInvitationResendSchema, { method: 'POST' });
          return { error: null, emailSent: result.emailSent };
        } catch (error) {
          return { error: { message: error instanceof Error ? error.message : 'The invitation could not be resent.' }, emailSent: false };
        }
      }
      const result = await authClient.organization.inviteMember({ organizationId: input.organizationId, email: input.email, role: input.role, resend: true });
      return { error: authError(result), emailSent: !result.error };
    },
  };

export const authApi = {
    setActiveOrganization: (organizationId: string) => authClient.organization.setActive({ organizationId }),
    signOut: () => authClient.signOut(),
    signInEmail: (input: { email: string; password: string; rememberMe?: boolean; callbackURL?: string }) => authClient.signIn.email(input),
    async requestPasswordReset(input: { email: string; redirectTo: string }): Promise<{ error: { message: string } | null }> {
      const result = await authClient.requestPasswordReset(input);
      return { error: authError(result) };
    },
    async resetPassword(input: { newPassword: string; token: string }): Promise<{ error: { message: string } | null }> {
      const result = await authClient.resetPassword(input);
      return { error: authError(result) };
    },
    signUpEmail: (input: { name: string; email: string; password: string; callbackURL?: string }) => authClient.signUp.email(input),
    getSession: () => authClient.getSession(),
    async getInvitation(id: string): Promise<{ data: InvitationDto | null; error: { message: string } | null }> {
      try {
        const result = await request(`/api/v1/invitations/${encodeURIComponent(id)}/preview`, invitationSchema);
        return { data: result, error: null };
      } catch (error) {
        return { data: null, error: { message: error instanceof Error ? error.message : 'Invitation is unavailable.' } };
      }
    },
    acceptInvitation: (invitationId: string) => authClient.organization.acceptInvitation({ invitationId }),
  };
