<script setup lang="ts">
import { useGetTaskRuns } from '~/features/task/composables/useTaskRunApi';

interface TaskRunsButtonProps {
  taskId: string;
}

// Props
const props = defineProps<TaskRunsButtonProps>();

// Emits
const emit = defineEmits<{
  (e: 'open'): void;
}>();

// Composables
const { t } = useI18n();
const { data } = useGetTaskRuns(() => props.taskId);

// Computed
const runCount = computed(() => data.value?.runs.length ?? 0);
</script>

<template>
  <!-- Closing the runs sheet returns focus here; that must not open the tooltip. -->
  <TooltipProvider v-if="runCount > 0" ignore-non-keyboard-focus>
    <Tooltip>
      <TooltipTrigger as-child>
        <Button
          variant="ghost"
          size="icon"
          class="relative text-icon"
          :aria-label="`${t('task.run.historyTitle')} (${runCount})`"
          @click="emit('open')"
        >
          <Icon name="hugeicons:clock-01" class="size-4" />
          <span
            class="absolute right-0.5 bottom-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 font-mono text-xxs leading-none text-primary-foreground ring-[1.5px] ring-canvas"
            aria-hidden="true"
          >
            {{ runCount }}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{{ t('task.run.historyTitle') }}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
