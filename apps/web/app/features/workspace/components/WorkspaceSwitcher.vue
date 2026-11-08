<script setup lang="ts">
import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';
import WorkspaceCreateDialog from '~/features/workspace/components/WorkspaceCreateDialog.vue';
import WorkspaceManageDialog from '~/features/workspace/components/WorkspaceManageDialog.vue';
import WorkspaceMenuItems from '~/features/workspace/components/WorkspaceMenuItems.vue';
import { useWorkspaceSwitcher } from '~/features/workspace/composables/useWorkspaceSwitcher';
import { MENU_CONTENT_CLASS } from '~/lib/menu-row';

interface WorkspaceSwitcherProps {
  collapsed?: boolean;
}

withDefaults(defineProps<WorkspaceSwitcherProps>(), { collapsed: false });

const isCreateDialogOpen = ref(false);
const isManageDialogOpen = ref(false);

const { data: organization } = useGetOrganization();
const { workspaces, groups, activeLabel, initials, isActive, selectWorkspace } =
  useWorkspaceSwitcher();

const mark = computed(() => initials.value.charAt(0).toUpperCase());
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="sidebar-menu-row"
        :aria-label="activeLabel || undefined"
      >
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-sm bg-sidebar-primary text-caption font-medium text-sidebar-primary-foreground"
        >
          {{ mark }}
        </span>
        <template v-if="!collapsed">
          <span class="flex min-w-0 flex-col text-left">
            <span class="truncate text-body font-medium text-foreground">
              {{ activeLabel }}
            </span>
            <span
              v-if="organization?.name"
              class="truncate text-caption text-muted-foreground"
            >
              {{ organization.name }}
            </span>
          </span>
          <Icon
            name="hugeicons:unfold-more"
            class="ml-auto size-4 shrink-0 text-icon"
          />
        </template>
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent
      side="bottom"
      align="start"
      :side-offset="6"
      :class="MENU_CONTENT_CLASS"
    >
      <WorkspaceMenuItems
        :groups="groups"
        :is-active="isActive"
        @select="selectWorkspace"
        @add="isCreateDialogOpen = true"
        @manage="isManageDialogOpen = true"
      />
    </DropdownMenuContent>
  </DropdownMenu>
  <WorkspaceCreateDialog v-model:open="isCreateDialogOpen" />
  <WorkspaceManageDialog
    v-model:open="isManageDialogOpen"
    :workspaces="workspaces"
  />
</template>
