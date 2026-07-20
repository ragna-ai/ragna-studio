<script setup lang="ts">
import { useGetWorkflowRuns } from '~/features/workflow/composables/useWorkflowApi';
import WorkflowRunStatusBadge from '~/features/workflow/components/WorkflowRunStatusBadge.vue';
import WorkflowRunTriggerBadge from '~/features/workflow/components/WorkflowRunTriggerBadge.vue';

// Imports

// Props
const props = defineProps<{
  workflowId: string;
}>();

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { data, isLoading } = useGetWorkflowRuns(
  () => props.workflowId,
  { enabled: () => open.value },
);
const { formatDateTime } = useDateTimeFormat();
const { t } = useI18n();

// Computed
const runs = computed(() => data.value?.runs ?? []);
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t('workflow.runsList.title') }}</DialogTitle>
        <DialogDescription>{{ t('workflow.runsList.subtitle') }}</DialogDescription>
      </DialogHeader>

      <p v-if="isLoading" class="text-sm text-muted-foreground">{{ t('workflow.runsList.loading') }}</p>
      <p v-else-if="runs.length === 0" class="text-sm text-muted-foreground">
        {{ t('workflow.recentRuns.empty') }}
      </p>
      <ul v-else class="max-h-96 space-y-2 overflow-y-auto">
        <li v-for="run in runs" :key="run.id">
          <NuxtLinkLocale
            :to="`/workflow/${workflowId}/run/${run.id}`"
            class="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-secondary"
            @click="open = false"
          >
            <span class="text-muted-foreground">{{ formatDateTime(run.createdAt) }}</span>
            <span class="flex items-center gap-1.5">
              <WorkflowRunTriggerBadge :trigger="run.triggeredBy" />
              <WorkflowRunStatusBadge :status="run.status" />
            </span>
          </NuxtLinkLocale>
        </li>
      </ul>
    </DialogContent>
  </Dialog>
</template>
