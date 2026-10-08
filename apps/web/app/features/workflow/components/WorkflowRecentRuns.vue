<script setup lang="ts">
import WorkflowRunStatusBadge from '~/features/workflow/components/WorkflowRunStatusBadge.vue';
import WorkflowRunTriggerBadge from '~/features/workflow/components/WorkflowRunTriggerBadge.vue';
import { useGetWorkflowRuns } from '~/features/workflow/composables/useWorkflowApi';

// Imports

const RECENT_RUNS_LIMIT = 3;

// Props
const props = defineProps<{
  workflowId: string;
}>();

// Emits
const emit = defineEmits<{
  (e: 'show-all-runs'): void;
}>();

// Composables
const { data: runsData, isLoading: isLoadingRuns } = useGetWorkflowRuns(
  () => props.workflowId,
);
const { formatDateTime } = useDateTimeFormat();
const { t } = useI18n();

// Computed
const recentRuns = computed(() =>
  (runsData.value?.runs ?? []).slice(0, RECENT_RUNS_LIMIT),
);
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between px-1">
      <p class="text-xs font-medium text-muted-foreground">
        {{ t('workflow.recentRuns.title') }}
      </p>
      <Button
        variant="ghost"
        size="sm"
        class="text-xs text-muted-foreground"
        @click="emit('show-all-runs')"
      >
        {{ t('workflow.recentRuns.showAll') }}
      </Button>
    </div>

    <p v-if="isLoadingRuns" class="px-1 text-xs text-muted-foreground">
      {{ t('workflow.recentRuns.loading') }}
    </p>
    <p
      v-else-if="recentRuns.length === 0"
      class="px-1 text-xs text-muted-foreground"
    >
      {{ t('workflow.recentRuns.empty') }}
    </p>
    <ul v-else class="flex flex-col gap-1">
      <li v-for="run in recentRuns" :key="run.id">
        <NuxtLinkLocale
          :to="`/workflow/${workflowId}/run/${run.id}`"
          class="flex flex-col gap-1.5 rounded-md border px-2 py-1.5 text-xs hover:bg-secondary"
        >
          <span class="text-muted-foreground">
            {{ formatDateTime(run.createdAt) }}
          </span>
          <span class="flex items-center gap-1.5">
            <WorkflowRunTriggerBadge :trigger="run.triggeredBy" />
            <WorkflowRunStatusBadge :status="run.status" />
          </span>
        </NuxtLinkLocale>
      </li>
    </ul>
  </div>
</template>
