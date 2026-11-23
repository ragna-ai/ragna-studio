<script setup lang="ts">
import AgentMark from '~/features/agent/components/AgentMark.vue';

interface TaskRunWorkingIndicatorProps {
  agentId: string;
  agentName: string;
  icon?: string | null;
  tone?: string | null;
}

// Props
defineProps<TaskRunWorkingIndicatorProps>();

// Composables
const { t } = useI18n();
</script>

<template>
  <span
    class="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground"
    data-testid="task-run-working"
  >
    <AgentMark :agent-id="agentId" :icon="icon" :tone="tone" :size="16" />
    <span
      class="size-1.5 shrink-0 rounded-full bg-status-ok motion-safe:animate-pulse"
      aria-hidden="true"
    />
    <span class="truncate">{{
      t('task.run.working', { agent: agentName })
    }}</span>
  </span>
</template>
