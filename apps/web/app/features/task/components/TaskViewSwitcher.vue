<script setup lang="ts">
import { ListIcon, SquareKanbanIcon, type LucideIcon } from '@lucide/vue';

// Segmented view switcher: built as an
// extensible list, not a boolean toggle, so a future calendar view is a
// third entry rather than a rewrite.
export type TaskView = 'board' | 'list';

const VIEWS: { value: TaskView; labelKey: string; icon: LucideIcon }[] = [
  { value: 'board', labelKey: 'task.view.board', icon: SquareKanbanIcon },
  { value: 'list', labelKey: 'task.view.list', icon: ListIcon },
];

// Refs
const view = defineModel<TaskView>({ required: true });

// Composables
const { t } = useI18n();
</script>

<template>
  <Tabs :model-value="view" @update:model-value="(v) => (view = v as TaskView)">
    <TabsList>
      <TabsTrigger
        v-for="option in VIEWS"
        :key="option.value"
        :value="option.value"
      >
        <component :is="option.icon" class="mr-1.5 size-4 stroke-1.5" />
        {{ t(option.labelKey) }}
      </TabsTrigger>
    </TabsList>
  </Tabs>
</template>
