<script setup lang="ts">
import { NODE_TYPES, type WorkflowNodeType } from '@repo/workflow';
import {
  BotIcon,
  GitBranchIcon,
  PlusIcon,
  ShuffleIcon,
  UsersIcon,
  WrenchIcon,
  ZapIcon,
} from '@lucide/vue';
import { NODE_TYPE_LABEL_KEYS } from '~/features/workflow/types/node-data';

// Imports

// Emits
const emit = defineEmits<{
  (e: 'add-node', type: WorkflowNodeType): void;
}>();

// Composables
const { t } = useI18n();

// Computed
const typeIcon: Record<WorkflowNodeType, typeof ZapIcon> = {
  trigger: ZapIcon,
  agent: BotIcon,
  tool: WrenchIcon,
  condition: GitBranchIcon,
  transform: ShuffleIcon,
  team: UsersIcon,
};
</script>

<template>
  <div class="flex flex-col gap-1">
    <p class="px-1 pb-1 text-xs font-medium text-muted-foreground">{{ t('workflow.palette.addNode') }}</p>
    <Button
      v-for="type in NODE_TYPES"
      :key="type"
      variant="outline"
      size="sm"
      class="justify-start gap-2"
      @click="emit('add-node', type)"
    >
      <component :is="typeIcon[type]" class="size-4 stroke-1.5 text-primary" />
      {{ t(NODE_TYPE_LABEL_KEYS[type]) }}
      <PlusIcon class="ml-auto size-3.5 stroke-1.5 text-muted-foreground" />
    </Button>
  </div>
</template>
