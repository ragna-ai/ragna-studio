import { useGetWorkspaces } from '~/features/workspace/composables/useWorkspaceApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';
import type {
  Workspace,
  WorkspaceVisibility,
} from '~/features/workspace/types';
import { createInitials } from '~/lib/utils';

export interface WorkspaceGroup {
  visibility: WorkspaceVisibility;
  workspaces: Workspace[];
}

const GROUP_ORDER: readonly WorkspaceVisibility[] = [
  'personal',
  'organization',
  'restricted',
];

export function useWorkspaceSwitcher() {
  const { data } = useGetWorkspaces();
  const { selectWorkspace, isActive, ensureActiveWorkspace } =
    useWorkspaceScopeStore();

  const workspaces = computed(() => data.value?.workspaces ?? []);
  const groups = computed<WorkspaceGroup[]>(() =>
    GROUP_ORDER.map((visibility) => ({
      visibility,
      workspaces: workspaces.value.filter(
        (workspace) => workspace.visibility === visibility,
      ),
    })).filter((group) => group.workspaces.length > 0),
  );
  const activeWorkspace = computed(() =>
    workspaces.value.find((workspace) => isActive(workspace.id)),
  );
  const activeLabel = computed(() => activeWorkspace.value?.name ?? '');
  const initials = computed(() =>
    createInitials(activeLabel.value, { firstNameOnly: true }),
  );

  // A workspace is always active once the list has loaded: fall back to the
  // first one when the persisted id is empty or points at a workspace that
  // no longer exists (e.g. deleted in another session).
  watch(data, (result) => {
    if (!result) return;
    ensureActiveWorkspace(result.workspaces);
  });

  return {
    workspaces,
    groups,
    activeWorkspace,
    activeLabel,
    initials,
    isActive,
    selectWorkspace,
  };
}
