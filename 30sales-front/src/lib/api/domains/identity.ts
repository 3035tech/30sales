import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { z } from 'zod';
import { access, roles, type OrganizationRole } from '../../permissions';
import { memberSchema, invitationSchema, type TeamMemberDto, type InvitationDto } from '../contracts';
import { apiAuthFetch } from '../client';

const authClient = createAuthClient({ baseURL: import.meta.env.VITE_API_URL ?? '', fetchOptions: { customFetchImpl: apiAuthFetch }, plugins: [organizationClient({ ac: access, roles })] });

function authError(result: { error?: { message?: string } | null }): { message: string } | null {
  return result.error ? { message: result.error.message ?? 'The request could not be completed.' } : null;
}

export const teamApi = {
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
      const result = await authClient.organization.getInvitation({ query: { id } });
      const error = authError(result);
      if (error || !result.data) return { data: null, error: error ?? { message: 'Invitation is unavailable.' } };
      const parsed = invitationSchema.safeParse(result.data);
      return parsed.success ? { data: parsed.data, error: null } : { data: null, error: { message: 'Invitation response is invalid.' } };
    },
    acceptInvitation: (invitationId: string) => authClient.organization.acceptInvitation({ invitationId }),
  };
