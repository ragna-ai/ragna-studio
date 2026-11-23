<script setup lang="ts">
import AgentMark from '~/features/agent/components/AgentMark.vue';
import { useTaskRunHighlight } from '~/features/task/composables/useTaskRunHighlight';
import {
  formatRunDuration,
  TASK_RUN_STATUS_TONE,
  taskRunElementId,
} from '~/features/task/lib/task-run-display';
import type { TaskRun } from '~/features/task/types';
import WorkflowTraceTimeline from '~/features/workflow/components/WorkflowTraceTimeline.vue';
import { cn } from '~/lib/utils';

interface TaskRunItemProps {
  run: TaskRun;
}

// Props
const props = defineProps<TaskRunItemProps>();

// Composables
const { t } = useI18n();
const { formatRelative } = useDateTimeFormat();
const { highlightedRunId } = useTaskRunHighlight();

// Computed
const isHighlighted = computed(() => highlightedRunId.value === props.run.id);
const duration = computed(() => formatRunDuration(props.run));
const agentName = computed(
  () => props.run.agent?.name ?? t('task.run.deletedAgent'),
);
</script>

<template>
  <li
    :id="taskRunElementId(run.id)"
    :class="
      cn(
        'flex scroll-mt-24 flex-col gap-2 rounded-md border p-3 transition-colors',
        isHighlighted && 'border-ring bg-surface-subtle',
      )
    "
    data-testid="task-run"
  >
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <Tag :tone="TASK_RUN_STATUS_TONE[run.status]">
        {{ t(`task.run.status.${run.status}`) }}
      </Tag>
      <Tag v-if="run.outcome === 'needs_input'" tone="ochre">
        {{ t('task.run.outcome.needs_input') }}
      </Tag>
      <span class="flex min-w-0 items-center gap-1.5 text-sm font-medium">
        <AgentMark
          :agent-id="run.agent?.id"
          :icon="run.agent?.icon"
          :tone="run.agent?.tone"
          :size="20"
        />
        <span class="truncate">{{ agentName }}</span>
      </span>
      <span v-if="run.agentVersion" class="text-muted-foreground">
        {{
          t('task.run.agentVersion', { number: run.agentVersion.versionNumber })
        }}
      </span>
      <span v-if="run.startedBy" class="text-muted-foreground">
        {{ t('task.run.startedBy', { user: run.startedBy.name }) }}
      </span>
      <time class="text-muted-foreground" :datetime="run.createdAt">
        {{ formatRelative(run.createdAt) }}
      </time>
      <span v-if="duration" class="text-muted-foreground">{{ duration }}</span>
      <span v-if="run.usage" class="text-muted-foreground">
        {{ t('task.run.credits', { count: run.usage.credits }) }}
      </span>
    </div>

    <p v-if="run.error" class="text-sm text-status-danger-fg">
      {{ run.error }}
    </p>

    <Collapsible v-if="run.trace.length > 0">
      <CollapsibleTrigger as-child>
        <Button variant="ghost" size="sm" class="w-fit">
          {{ t('task.run.steps', { count: run.trace.length }) }}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent class="pt-2">
        <WorkflowTraceTimeline :trace="run.trace" />
      </CollapsibleContent>
    </Collapsible>
  </li>
</template>
