import { useGetWorkspaces } from '~/features/workspace/composables/useWorkspaceApi';

/** The caller's private workspace (at most one) and whether it is the active one. */
export function usePersonalWorkspace() {
  const activeWorkspaceId = useActiveWorkspaceId();
  const { data, isLoading } = useGetWorkspaces();

  const personalWorkspace = computed(() =>
    data.value?.workspaces.find(
      (workspace) => workspace.visibility === 'personal',
    ),
  );
  const personalWorkspaceId = computed(() => personalWorkspace.value?.id ?? '');
  const isPersonalActive = computed(
    () =>
      !!personalWorkspaceId.value &&
      personalWorkspaceId.value === activeWorkspaceId.value,
  );

  return {
    personalWorkspace,
    personalWorkspaceId,
    isPersonalActive,
    isLoading,
  };
}
