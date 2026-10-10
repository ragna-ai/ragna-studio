import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type {
  AuthResult,
  OrganizationAssignableRole,
  OrganizationInvitationRecord,
} from '@repo/auth/client';
import type {
  OrganizationMember,
  OrganizationMembersResponse,
  OrganizationResponse,
  OrganizationUsageResponse,
} from '~/features/organization/types';
import type { RestrictedWorkspacesResponse } from '~/features/workspace/types';
import { extractErrorMessage } from '~/lib/api-error';

export const organizationKeys = {
  all: ['organization'] as const,
  detail: ['organization', 'detail'] as const,
  members: ['organization', 'members'] as const,
  invitations: ['organization', 'invitations'] as const,
  usage: ['organization', 'usage'] as const,
  restrictedWorkspaces: ['organization', 'workspaces'] as const,
};

/** Turns a better-auth `{ data, error }` result into a value or a thrown error with the server message. */
function unwrapAuthResult<T>(result: AuthResult<T>): T {
  if (result.error || result.data === null) {
    throw new Error(result.error?.message ?? 'Request failed');
  }
  return result.data;
}

export function organizationErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error && error.message) return error.message;
  return extractErrorMessage(error, fallback);
}

export function useGetOrganization() {
  const { $api } = useNuxtApp();
  return useQuery<OrganizationResponse>({
    queryKey: organizationKeys.detail,
    queryFn: ({ signal }) =>
      $api<OrganizationResponse>('/organization', { method: 'GET', signal }),
    staleTime: Infinity,
  });
}

export function useGetOrganizationMembers() {
  const { $api } = useNuxtApp();
  return useQuery<OrganizationMember[]>({
    queryKey: organizationKeys.members,
    queryFn: async ({ signal }) =>
      (
        await $api<OrganizationMembersResponse>('/organization/members', {
          method: 'GET',
          signal,
        })
      ).members,
  });
}

export function useGetOrganizationInvitations(
  enabled: MaybeRefOrGetter<boolean>,
) {
  const authClient = useAuth();
  return useQuery<OrganizationInvitationRecord[]>({
    queryKey: organizationKeys.invitations,
    queryFn: async () =>
      unwrapAuthResult(await authClient.organization.listInvitations()),
    enabled,
  });
}

export function useGetOrganizationUsage(enabled: MaybeRefOrGetter<boolean>) {
  const { $api } = useNuxtApp();
  return useQuery<OrganizationUsageResponse>({
    queryKey: organizationKeys.usage,
    queryFn: ({ signal }) =>
      $api<OrganizationUsageResponse>('/organization/usage', {
        method: 'GET',
        signal,
      }),
    enabled,
  });
}

export function useGetRestrictedWorkspaces(enabled: MaybeRefOrGetter<boolean>) {
  const { $api } = useNuxtApp();
  return useQuery<RestrictedWorkspacesResponse>({
    queryKey: organizationKeys.restrictedWorkspaces,
    queryFn: ({ signal }) =>
      $api<RestrictedWorkspacesResponse>('/organization/workspaces', {
        method: 'GET',
        signal,
      }),
    enabled,
  });
}

/** Mutation whose failure message (server text when present) is shown by the caller via `organizationErrorMessage`. */
function useOrganizationMutation<TVariables>(
  run: (variables: TVariables) => Promise<unknown>,
  invalidates: readonly (readonly string[])[],
) {
  const queryClient = useQueryClient();
  return useMutation<unknown, unknown, TVariables>({
    mutationFn: run,
    onSuccess: () =>
      Promise.all(
        invalidates.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export function useRenameOrganization() {
  const authClient = useAuth();
  return useOrganizationMutation(
    async (name: string) =>
      unwrapAuthResult(
        await authClient.organization.update({ data: { name } }),
      ),
    [organizationKeys.detail],
  );
}

export function useInviteMember() {
  const authClient = useAuth();
  return useOrganizationMutation(
    async (input: { email: string; role: OrganizationAssignableRole }) =>
      unwrapAuthResult(await authClient.organization.inviteMember(input)),
    [organizationKeys.invitations],
  );
}

export function useCancelInvitation() {
  const authClient = useAuth();
  return useOrganizationMutation(
    async (invitationId: string) =>
      unwrapAuthResult(
        await authClient.organization.cancelInvitation({ invitationId }),
      ),
    [organizationKeys.invitations],
  );
}

export function useUpdateMemberRole() {
  const authClient = useAuth();
  return useOrganizationMutation(
    async (input: { memberId: string; role: OrganizationAssignableRole }) =>
      unwrapAuthResult(await authClient.organization.updateMemberRole(input)),
    [organizationKeys.members],
  );
}

export function useRemoveMember() {
  const { $api } = useNuxtApp();
  return useOrganizationMutation(
    (memberId: string) =>
      $api(`/organization/members/${memberId}`, { method: 'DELETE' }),
    [organizationKeys.members, organizationKeys.usage],
  );
}

export function useRestoreMember() {
  const { $api } = useNuxtApp();
  return useOrganizationMutation(
    (memberId: string) =>
      $api(`/organization/members/${memberId}/restore`, { method: 'POST' }),
    [organizationKeys.members],
  );
}

export function useTransferOwnership() {
  const { $api } = useNuxtApp();
  return useOrganizationMutation(
    (memberId: string) =>
      $api('/organization/transfer-ownership', {
        method: 'POST',
        body: { memberId },
      }),
    [organizationKeys.all],
  );
}

export function useDeleteOrganization() {
  const { $api } = useNuxtApp();
  return useOrganizationMutation(
    () => $api('/organization', { method: 'DELETE' }),
    [organizationKeys.detail],
  );
}

export function useRestoreOrganization() {
  const { $api } = useNuxtApp();
  return useOrganizationMutation(
    () => $api('/organization/restore', { method: 'POST' }),
    [organizationKeys.all],
  );
}

export function useLeaveOrganization() {
  const { $api } = useNuxtApp();
  return useMutation<unknown, unknown, void>({
    mutationFn: () => $api('/organization/leave', { method: 'POST' }),
  });
}
