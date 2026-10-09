<script setup lang="ts">
import { CheckIcon, ChevronsUpDownIcon, SettingsIcon } from '@lucide/vue';
import WorkspaceVisibilityIcon from '~/features/workspace/components/WorkspaceVisibilityIcon.vue';
import WorkspaceManageDialog from '~/features/workspace/components/WorkspaceManageDialog.vue';
import { useGetWorkspaces } from '~/features/workspace/composables/useWorkspaceApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';
import type {
  Workspace,
  WorkspaceVisibility,
} from '~/features/workspace/types';
import { cn, createInitials } from '~/lib/utils';

interface WorkspaceGroup {
  visibility: WorkspaceVisibility;
  workspaces: Workspace[];
}

const GROUP_ORDER: readonly WorkspaceVisibility[] = [
  'personal',
  'organization',
  'restricted',
];

interface WorkspaceSwitcherProps {
  size?: 'sm' | 'md' | 'lg';
  // When false, renders an icon-only trigger (initials in a circle) instead
  // of the full pill with name + chevron. Used in the collapsed nav sidebar.
  sizeFull?: boolean;
}

// Props
const props = withDefaults(defineProps<WorkspaceSwitcherProps>(), {
  sizeFull: true,
});

// Refs
const isManageDialogOpen = ref(false);

// Composables
const { data } = useGetWorkspaces();
const { selectWorkspace, isActive, ensureActiveWorkspace } =
  useWorkspaceScopeStore();
const { t } = useI18n();

// Computed
const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return { button: 'h-7 text-xs', label: 'max-w-28' };
    case 'md':
      return { button: 'h-8 text-sm', label: 'max-w-28' };
    case 'lg':
      return {
        button:
          'h-9 text-2xl border-0 text-foreground/90 font-medium hover:bg-transparent hover:text-foreground/90 bg-transparent p-0 hover:shadow-none',
        label: 'max-w-38',
      };
    default:
      return { button: 'h-7 text-xs', label: 'max-w-28' };
  }
});
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

// Hooks
// A workspace is always active once the list has loaded: fall back to the
// first one when the persisted id is empty or points at a workspace that
// no longer exists (e.g. deleted in another session).
watch(data, (result) => {
  if (!result) return;
  ensureActiveWorkspace(result.workspaces);
});
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        v-if="sizeFull"
        type="button"
        :class="
          cn(
            'flex h-7 items-center gap-1 rounded-full border bg-white p-4',
            sizeClass.button,
          )
        "
      >
        <WorkspaceVisibilityIcon
          v-if="activeWorkspace"
          :visibility="activeWorkspace.visibility"
          class="size-3 shrink-0 text-muted-foreground"
        />
        <span :class="cn('max-w-28 truncate', sizeClass.label)">{{
          activeLabel
        }}</span>
        <ChevronsUpDownIcon class="size-3 shrink-0 opacity-50" />
      </button>
      <button
        v-else
        type="button"
        :title="activeLabel"
        class="flex size-8 shrink-0 items-center justify-center rounded-lg border border-stone-400 bg-muted"
      >
        <span class="text-sm font-medium">{{ initials }}</span>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-56">
      <template v-if="groups.length > 0">
        <DropdownMenuGroup v-for="group in groups" :key="group.visibility">
          <DropdownMenuLabel class="text-xs text-muted-foreground">
            {{ t(`workspace.visibility.${group.visibility}`) }}
          </DropdownMenuLabel>
          <DropdownMenuItem
            v-for="workspace in group.workspaces"
            :key="workspace.id"
            @click="selectWorkspace(workspace.id)"
          >
            <CheckIcon
              class="mr-2 size-4"
              :class="isActive(workspace.id) ? 'opacity-100' : 'opacity-0'"
            />
            <span class="flex-1 truncate">{{ workspace.name }}</span>
            <WorkspaceVisibilityIcon
              :visibility="workspace.visibility"
              class="ml-2 size-3.5 shrink-0 text-muted-foreground"
            />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
      </template>
      <DropdownMenuItem @click="isManageDialogOpen = true">
        <SettingsIcon class="mr-2 size-4" />
        {{ t('workspace.switcher.manage') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <WorkspaceManageDialog
    v-model:open="isManageDialogOpen"
    :workspaces="workspaces"
  />
</template>
