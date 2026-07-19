<script setup lang="ts">
import { CheckIcon, ChevronsUpDownIcon, SettingsIcon } from '@lucide/vue';
import WorkspaceManageDialog from '~/features/workspace/components/WorkspaceManageDialog.vue';
import { useGetWorkspaces } from '~/features/workspace/composables/useWorkspaceApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

// Refs
const isManageDialogOpen = ref(false);

// Composables
const { data } = useGetWorkspaces();
const { selectWorkspace, isActive, ensureActiveWorkspace } =
  useWorkspaceScopeStore();
const { t } = useI18n();

// Computed
const workspaces = computed(() => data.value?.workspaces ?? []);
const activeLabel = computed(() => {
  const active = workspaces.value.find((workspace) => isActive(workspace.id));
  return active?.name ?? '';
});

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
        type="button"
        class="flex h-7 items-center gap-1 rounded-md border px-2 text-xs text-stone-600 hover:bg-stone-100"
      >
        <span class="max-w-28 truncate">{{ activeLabel }}</span>
        <ChevronsUpDownIcon class="size-3 shrink-0 opacity-50" />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-56">
      <template v-if="workspaces.length > 0">
        <DropdownMenuItem
          v-for="workspace in workspaces"
          :key="workspace.id"
          @click="selectWorkspace(workspace.id)"
        >
          <CheckIcon
            class="mr-2 size-4"
            :class="isActive(workspace.id) ? 'opacity-100' : 'opacity-0'"
          />
          <span class="truncate">{{ workspace.name }}</span>
        </DropdownMenuItem>
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
