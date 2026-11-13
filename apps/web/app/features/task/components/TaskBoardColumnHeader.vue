<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import type { TaskStatusOption } from '~/features/task/lib/task-display';
import { cn } from '~/lib/utils';

interface TaskBoardColumnHeaderProps {
  status: TaskStatusOption;
  count: number;
  hideCount?: boolean;
  class?: HTMLAttributes['class'];
}

// Props
const props = defineProps<TaskBoardColumnHeaderProps>();

// Emits
const emit = defineEmits<{ create: [] }>();

// Composables
const { t } = useI18n();

// Computed
const createLabel = computed(() =>
  t('task.board.createInStatus', { status: t(props.status.labelKey) }),
);
</script>

<template>
  <div :class="cn('flex h-9 items-center pr-1.5 pl-3', props.class)">
    <Icon
      :name="status.icon"
      :class="cn('size-3.5 shrink-0', status.iconClass)"
      aria-hidden="true"
    />
    <span class="ml-2 text-body font-medium">{{ t(status.labelKey) }}</span>
    <span v-if="!hideCount" class="ml-1.5 text-mono-sm text-muted-foreground">{{
      count
    }}</span>
    <span class="flex-1" />
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            :aria-label="createLabel"
            @click="emit('create')"
          >
            <Icon name="hugeicons:plus-sign" class="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{{ createLabel }}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</template>
