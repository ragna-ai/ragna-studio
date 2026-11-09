<script setup lang="ts">
import type { WorkspaceGroup } from '~/features/workspace/composables/useWorkspaceSwitcher';
import { MENU_ROW_CLASS, MENU_SEPARATOR_CLASS } from '~/lib/menu-row';

interface WorkspaceMenuItemsProps {
  groups: WorkspaceGroup[];
  isActive: (workspaceId: string) => boolean;
}

const props = defineProps<WorkspaceMenuItemsProps>();

const emit = defineEmits<{
  select: [workspaceId: string];
  add: [];
  manage: [];
}>();

const { t } = useI18n();
</script>

<template>
  <template v-if="props.groups.length > 0">
    <DropdownMenuGroup v-for="group in props.groups" :key="group.visibility">
      <DropdownMenuLabel
        class="flex h-7 items-center px-2.5 py-0 text-caption font-normal text-muted-foreground"
      >
        {{ t(`workspace.visibility.${group.visibility}`) }}
      </DropdownMenuLabel>
      <DropdownMenuItem
        v-for="workspace in group.workspaces"
        :key="workspace.id"
        :class="[
          MENU_ROW_CLASS,
          { 'bg-surface-subtle': props.isActive(workspace.id) },
        ]"
        @click="emit('select', workspace.id)"
      >
        <span class="flex-1 truncate">{{ workspace.name }}</span>
        <Icon
          v-if="props.isActive(workspace.id)"
          name="hugeicons:tick-02"
          class="size-4 shrink-0 text-foreground"
        />
      </DropdownMenuItem>
    </DropdownMenuGroup>
    <DropdownMenuSeparator :class="MENU_SEPARATOR_CLASS" />
  </template>
  <DropdownMenuItem :class="MENU_ROW_CLASS" @click="emit('add')">
    <Icon name="hugeicons:plus-sign" class="size-4 text-foreground" />
    {{ t('workspace.switcher.add') }}
  </DropdownMenuItem>
  <DropdownMenuItem :class="MENU_ROW_CLASS" @click="emit('manage')">
    <Icon name="hugeicons:settings-01" class="size-4 text-foreground" />
    {{ t('workspace.switcher.manage') }}
  </DropdownMenuItem>
</template>
