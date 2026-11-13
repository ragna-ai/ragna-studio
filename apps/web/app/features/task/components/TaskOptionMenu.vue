<script setup lang="ts" generic="T extends string">
import TaskPropertyButton from '~/features/task/components/TaskPropertyButton.vue';
import { cn } from '~/lib/utils';

export interface TaskOptionMenuItem<V extends string> {
  value: V;
  labelKey: string;
  icon: string;
  iconClass: string;
}

interface TaskOptionMenuProps {
  options: readonly TaskOptionMenuItem<T>[];
  /** Label shown while `emptyValue` is selected. */
  placeholder?: string;
  emptyValue?: T;
}

// Props
const props = defineProps<TaskOptionMenuProps>();

// Models
const model = defineModel<T>({ required: true });

// Composables
const { t } = useI18n();

// Computed
const current = computed(() =>
  props.options.find((option) => option.value === model.value),
);
const isEmpty = computed(
  () => props.emptyValue !== undefined && model.value === props.emptyValue,
);
const label = computed(() => {
  if (isEmpty.value && props.placeholder) {
    return props.placeholder;
  }
  return current.value ? t(current.value.labelKey) : '';
});
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <TaskPropertyButton :label="label" :is-set="!isEmpty">
        <template v-if="current" #leading>
          <Icon
            :name="current.icon"
            :class="cn('size-3.5', current.iconClass)"
            aria-hidden="true"
          />
        </template>
      </TaskPropertyButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" :side-offset="8" class="min-w-50">
      <DropdownMenuItem
        v-for="option in options"
        :key="option.value"
        @select="model = option.value"
      >
        <Icon
          :name="option.icon"
          :class="cn('size-3.5', option.iconClass)"
          aria-hidden="true"
        />
        {{ t(option.labelKey) }}
        <Icon
          v-if="option.value === model"
          name="hugeicons:tick-02"
          class="ml-auto size-4 text-foreground"
          aria-hidden="true"
        />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
