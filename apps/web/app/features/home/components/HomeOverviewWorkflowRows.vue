<script setup lang="ts">
import HomeOverviewRow from '~/features/home/components/HomeOverviewRow.vue';
import {
  WORKFLOW_STATUS_LABEL_KEY,
  WORKFLOW_STATUS_TONE,
} from '~/features/home/lib/dashboard';
import type { HomeOverviewWorkflowItem } from '~/features/home/types';

interface HomeOverviewWorkflowRowsProps {
  workflows: HomeOverviewWorkflowItem[];
}

defineProps<HomeOverviewWorkflowRowsProps>();
</script>

<template>
  <HomeOverviewRow
    v-for="workflow in workflows"
    :key="workflow.id"
    :to="`/workflow/${workflow.id}`"
  >
    <span class="min-w-0 grow truncate text-body font-medium">{{
      workflow.name
    }}</span>
    <StatusPill
      v-if="workflow.lastRunStatus"
      :tone="WORKFLOW_STATUS_TONE[workflow.lastRunStatus]"
      :label="$t(WORKFLOW_STATUS_LABEL_KEY[workflow.lastRunStatus])"
    />
    <span v-else class="text-caption text-muted-foreground">{{
      $t('home.dashboard.workflows.neverRun')
    }}</span>
  </HomeOverviewRow>
</template>
