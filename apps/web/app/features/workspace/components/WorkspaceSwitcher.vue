<script setup lang="ts">
import { ChevronsUpDownIcon } from '@lucide/vue';
import WorkspaceManageDialog from '~/features/workspace/components/WorkspaceManageDialog.vue';
import WorkspaceMenuItems from '~/features/workspace/components/WorkspaceMenuItems.vue';
import WorkspaceVisibilityIcon from '~/features/workspace/components/WorkspaceVisibilityIcon.vue';
import { useWorkspaceSwitcher } from '~/features/workspace/composables/useWorkspaceSwitcher';
import { cn } from '~/lib/utils';

interface WorkspaceSwitcherProps {
  size?: 'sm' | 'md' | 'lg';
}

// Props
const props = defineProps<WorkspaceSwitcherProps>();

// Refs
const isManageDialogOpen = ref(false);

// Composables
const {
  workspaces,
  groups,
  activeWorkspace,
  activeLabel,
  isActive,
  selectWorkspace,
} = useWorkspaceSwitcher();

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
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
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
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-56">
      <WorkspaceMenuItems
        :groups="groups"
        :is-active="isActive"
        @select="selectWorkspace"
        @manage="isManageDialogOpen = true"
      />
    </DropdownMenuContent>
  </DropdownMenu>
  <WorkspaceManageDialog
    v-model:open="isManageDialogOpen"
    :workspaces="workspaces"
  />
</template>
