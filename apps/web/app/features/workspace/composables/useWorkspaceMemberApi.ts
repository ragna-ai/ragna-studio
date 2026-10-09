import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { organizationKeys } from '~/features/organization/composables/useOrganizationApi';
import { workspaceKeys } from '~/features/workspace/composables/useWorkspaceApi';
import type {
  WorkspaceMember,
  WorkspaceMembersResponse,
  WorkspaceRole,
} from '~/features/workspace/types';

export const workspaceMemberKeys = {
  list: (workspaceId: string) =>
    ['workspaces', 'members', workspaceId] as const,
};

interface AddWorkspaceMemberVariables {
  userId: string;
  workspaceRole: WorkspaceRole;
}

interface ChangeWorkspaceMemberRoleVariables {
  userId: string;
  workspaceRole: WorkspaceRole;
}

export function useGetWorkspaceMembers(workspaceId: MaybeRefOrGetter<string>) {
  const { $api } = useNuxtApp();
  return useQuery<WorkspaceMember[]>({
    queryKey: computed(() => workspaceMemberKeys.list(toValue(workspaceId))),
    queryFn: async ({ signal }) =>
      (
        await $api<WorkspaceMembersResponse>(
          `/workspace/${toValue(workspaceId)}/members`,
          { method: 'GET', signal },
        )
      ).members,
  });
}

/**
 * Member changes can alter the caller's own role or access, and the restricted
 * workspace counts, so the workspace and organization lists refresh too.
 */
function useInvalidateAfterMemberChange() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all }),
      queryClient.invalidateQueries({
        queryKey: organizationKeys.restrictedWorkspaces,
      }),
    ]);
}

export function useAddWorkspaceMember(workspaceId: MaybeRefOrGetter<string>) {
  const { $api } = useNuxtApp();
  return useMutation<unknown, unknown, AddWorkspaceMemberVariables>({
    mutationFn: ({ userId, workspaceRole }) =>
      $api(`/workspace/${toValue(workspaceId)}/members`, {
        method: 'POST',
        body: { userId, workspaceRole },
      }),
    onSuccess: useInvalidateAfterMemberChange(),
  });
}

export function useChangeWorkspaceMemberRole(
  workspaceId: MaybeRefOrGetter<string>,
) {
  const { $api } = useNuxtApp();
  return useMutation<unknown, unknown, ChangeWorkspaceMemberRoleVariables>({
    mutationFn: ({ userId, workspaceRole }) =>
      $api(`/workspace/${toValue(workspaceId)}/members/${userId}`, {
        method: 'PATCH',
        body: { workspaceRole },
      }),
    onSuccess: useInvalidateAfterMemberChange(),
  });
}

/** Removes a member. When `userId` is the caller, this is "leave workspace". */
export function useRemoveWorkspaceMember(
  workspaceId: MaybeRefOrGetter<string>,
) {
  const { $api } = useNuxtApp();
  return useMutation<unknown, unknown, string>({
    mutationFn: (userId) =>
      $api(`/workspace/${toValue(workspaceId)}/members/${userId}`, {
        method: 'DELETE',
      }),
    onSuccess: useInvalidateAfterMemberChange(),
  });
}
