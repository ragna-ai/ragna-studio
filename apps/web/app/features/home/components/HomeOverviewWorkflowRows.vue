<script setup lang="ts">
import type { WorkflowRunStatus } from '@repo/workflow';
import type { HomeOverviewWorkflowItem } from '~/features/home/types';

// Props
defineProps<{ workflows: HomeOverviewWorkflowItem[] }>();

// Composables
const { t, locale } = useI18n();

// Dot color per last run status, same palette intent as
// WorkflowRunStatusBadge.vue; gray/never-run is unique to this card
// (docs/home/prd.md, "Workflows card").
const dotClassByStatus: Record<WorkflowRunStatus, string> = {
  pending: 'bg-stone-400',
  running: 'bg-blue-500',
  suspended: 'bg-amber-500',
  completed: 'bg-green-600',
  failed: 'bg-destructive',
  cancelled: 'bg-stone-400',
};

// Functions
function dotClass(status: WorkflowRunStatus | null): string {
  return status ? dotClassByStatus[status] : 'bg-stone-300';
}

function statusLabel(status: WorkflowRunStatus | null): string {
  return status
    ? t(`workflow.status.${status}`)
    : t('home.overview.workflows.neverRun');
}
</script>

<template>
  <div class="divide-y divide-foreground/5">
    <NuxtLinkLocale
      v-for="workflow in workflows"
      :key="workflow.id"
      :to="`/workflow/${workflow.id}`"
      class="flex items-center gap-3 px-6 py-2.5 text-sm hover:bg-accent"
    >
      <span
        class="size-2 shrink-0 rounded-full"
        :class="dotClass(workflow.lastRunStatus)"
        :title="statusLabel(workflow.lastRunStatus)"
      />
      <span class="grow truncate font-medium text-foreground">{{
        workflow.name
      }}</span>
      <NuxtTime
        :datetime="workflow.updatedAt"
        :locale="locale"
        relative
        class="shrink-0 text-xs whitespace-nowrap text-muted-foreground"
      />
    </NuxtLinkLocale>
  </div>
</template>
