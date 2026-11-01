<script setup lang="ts">
import { CheckIcon, PlusIcon, SettingsIcon } from '@lucide/vue';
import WorkspaceVisibilityIcon from '~/features/workspace/components/WorkspaceVisibilityIcon.vue';
import type { WorkspaceGroup } from '~/features/workspace/composables/useWorkspaceSwitcher';

interface WorkspaceMenuItemsProps {
  groups: WorkspaceGroup[];
  isActive: (workspaceId: string) => boolean;
  showAdd?: boolean;
}

const props = withDefaults(defineProps<WorkspaceMenuItemsProps>(), {
  showAdd: false,
});

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
      <DropdownMenuLabel class="text-xs text-muted-foreground">
        {{ t(`workspace.visibility.${group.visibility}`) }}
      </DropdownMenuLabel>
      <DropdownMenuItem
        v-for="workspace in group.workspaces"
        :key="workspace.id"
        @click="emit('select', workspace.id)"
      >
        <CheckIcon
          class="mr-2 size-4"
          :class="props.isActive(workspace.id) ? 'opacity-100' : 'opacity-0'"
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
  <DropdownMenuItem v-if="props.showAdd" @click="emit('add')">
    <PlusIcon class="mr-2 size-4" />
    {{ t('workspace.switcher.add') }}
  </DropdownMenuItem>
  <DropdownMenuItem @click="emit('manage')">
    <SettingsIcon class="mr-2 size-4" />
    {{ t('workspace.switcher.manage') }}
  </DropdownMenuItem>
</template>
