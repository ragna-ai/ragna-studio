/**
 * The workspace currently selected in the switcher.
 *
 * `null` means "All items" (the unfiltered view across the user's data) and
 * is the default per docs/workspaces.md. This is purely client-side view
 * state, never persisted server-side and never a security boundary: it is
 * only ever sent as an optional `workspaceId` filter on list/create requests.
 *
 * Uses `useState` -> single shared instance keyed by name, matching the
 * pattern already used for pagination/search state in the list composables
 * (see e.g. useAgentList.ts), so every caller reads and writes the same
 * value instead of getting its own independent state.
 */
export function useActiveWorkspace() {
  const activeWorkspaceId = useState<string | null>(
    'workspace:active-id',
    () => null,
  );

  function setActiveWorkspace(workspaceId: string | null) {
    activeWorkspaceId.value = workspaceId;
  }

  return { activeWorkspaceId, setActiveWorkspace };
}
