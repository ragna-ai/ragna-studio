<script setup lang="ts" generic="T extends string">
import type { LucideIcon } from '@lucide/vue';

export interface ViewOption<T extends string> {
  value: T;
  labelKey: string;
  icon: LucideIcon;
}

// Props
const props = defineProps<{ options: readonly ViewOption<T>[] }>();

// Refs
const view = defineModel<T>({ required: true });

// Composables
const { t } = useI18n();

// Functions
function selectView(value: string | number) {
  const selected = props.options.find((option) => option.value === value);
  if (selected) {
    view.value = selected.value;
  }
}
</script>

<template>
  <Tabs :model-value="view" @update:model-value="selectView">
    <TabsList>
      <TabsTrigger
        v-for="option in options"
        :key="option.value"
        :value="option.value"
      >
        <component :is="option.icon" class="mr-1.5 size-4 stroke-1.5" />
        {{ t(option.labelKey) }}
      </TabsTrigger>
    </TabsList>
  </Tabs>
</template>
