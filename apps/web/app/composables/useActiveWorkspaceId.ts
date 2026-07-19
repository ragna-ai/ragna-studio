import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

/** Reactive id of the workspace currently active in the workspace switcher. */
export function useActiveWorkspaceId() {
  return storeToRefs(useWorkspaceScopeStore()).activeWorkspaceId;
}
