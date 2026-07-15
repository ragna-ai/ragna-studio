/**
 * The selection currently active in the workspace switcher.
 *
 * There are three kinds of view (docs/workspaces.md):
 * - `all`        -> All items: the unfiltered view across the user's data.
 * - `unassigned` -> only items with no workspace.
 * - `workspace`  -> a single named workspace, by id.
 *
 * This is purely client-side view state, never persisted server-side and
 * never a security boundary: it only ever shapes the optional `workspaceId` /
 * `unassigned` filter on list requests and the `workspaceId` stamped on newly
 * created items.
 *
 * Uses `useState` -> single shared instance keyed by name, matching the
 * pattern already used for pagination/search state in the list composables
 * (see e.g. useAgentList.ts), so every caller reads and writes the same value.
 */
export type WorkspaceScope =
  | { kind: 'all' }
  | { kind: 'unassigned' }
  | { kind: 'workspace'; workspaceId: string };

/** Query params a scoped list endpoint accepts for the active selection. */
export interface WorkspaceListQuery {
  workspaceId?: string;
  unassigned?: true;
}

export function useActiveWorkspace() {
  const scope = useState<WorkspaceScope>('workspace:scope', () => ({
    kind: 'all',
  }));

  function selectAllItems() {
    scope.value = { kind: 'all' };
  }

  function selectUnassigned() {
    scope.value = { kind: 'unassigned' };
  }

  function selectWorkspace(workspaceId: string) {
    scope.value = { kind: 'workspace', workspaceId };
  }

  const isAllItemsActive = computed(() => scope.value.kind === 'all');
  const isUnassignedActive = computed(() => scope.value.kind === 'unassigned');

  function isWorkspaceActive(workspaceId: string) {
    return (
      scope.value.kind === 'workspace' &&
      scope.value.workspaceId === workspaceId
    );
  }

  /**
   * A stable string identifying the active selection, for use in vue-query
   * keys so switching selection refetches: `'all'`, `'unassigned'`, or the id.
   */
  const scopeKey = computed<string>(() =>
    scope.value.kind === 'workspace' ? scope.value.workspaceId : scope.value.kind,
  );

  /**
   * The workspace id to stamp on newly created items, or `null` when none
   * applies. All and Unassigned both mean "no workspace", so only a specific
   * workspace assigns one.
   */
  const createWorkspaceId = computed<string | null>(() =>
    scope.value.kind === 'workspace' ? scope.value.workspaceId : null,
  );

  /**
   * Query params for scoped list endpoints, per docs/workspaces.md:
   * All -> neither param; workspace -> `workspaceId`; Unassigned -> `unassigned=true`.
   */
  const listQuery = computed<WorkspaceListQuery>(() => {
    if (scope.value.kind === 'workspace') {
      return { workspaceId: scope.value.workspaceId };
    }
    if (scope.value.kind === 'unassigned') {
      return { unassigned: true };
    }
    return {};
  });

  return {
    scope,
    selectAllItems,
    selectUnassigned,
    selectWorkspace,
    isAllItemsActive,
    isUnassignedActive,
    isWorkspaceActive,
    scopeKey,
    createWorkspaceId,
    listQuery,
  };
}
