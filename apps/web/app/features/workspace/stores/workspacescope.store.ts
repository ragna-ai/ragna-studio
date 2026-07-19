import { defineStore } from 'pinia';
import type { Workspace } from '~/features/workspace/types';

/**
 * The single workspace currently active in the workspace switcher.
 *
 * Every workspace-scoped resource lives in exactly one workspace (the
 * container model, see docs/api-standards/prd.md). This store only tracks
 * *which* workspace is active in the UI: it is never a security boundary,
 * and it only ever shapes the `workspaceId` route param on scoped requests
 * and the id stamped on newly created items.
 */
export const useWorkspaceScopeStore = defineStore('workspace-scope', () => {
  // Empty string means "no selection yet" (e.g. first visit, before the
  // workspace list has loaded). Callers apply ensureActiveWorkspace() once
  // they have a list to fall back into.
  const activeWorkspaceId = useLocalStorage('workspace-scope', '');

  function selectWorkspace(workspaceId: string) {
    activeWorkspaceId.value = workspaceId;
  }

  function isActive(workspaceId: string) {
    return activeWorkspaceId.value === workspaceId;
  }

  /**
   * Falls back to the first workspace when the persisted id is empty or no
   * longer in the given list (e.g. deleted in another session, or this is
   * the user's first visit). The store never fetches the workspace list
   * itself; callers that already have one (the switcher, or any page that
   * loads workspaces) run this after loading.
   */
  function ensureActiveWorkspace(workspaces: Workspace[]) {
    if (workspaces.length === 0) return;
    const isStillValid = workspaces.some(
      (workspace) => workspace.id === activeWorkspaceId.value,
    );
    if (isStillValid) return;
    const fallbackWorkspace = workspaces[0];
    if (!fallbackWorkspace) return;
    activeWorkspaceId.value = fallbackWorkspace.id;
  }

  return {
    activeWorkspaceId,
    selectWorkspace,
    isActive,
    ensureActiveWorkspace,
  };
});
