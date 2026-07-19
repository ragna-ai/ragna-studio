<script setup lang="ts">
import { TriangleAlertIcon } from '@lucide/vue';
import type { WorkflowDefinition } from '@repo/workflow';
import { isExecutionEquivalent } from '@repo/workflow';
import {
  useCreateWorkflowRun,
  usePublishWorkflow,
  useUpdateWorkflow,
} from '~/features/workflow/composables/useWorkflowApi';
import type { Workflow } from '~/features/workflow/types';

// Imports

// Props
const props = defineProps<{
  workspaceId: string;
  workflow: Workflow;
  draftDefinition: WorkflowDefinition;
}>();

// Refs
const open = defineModel<boolean>('open', { default: false });
const input = ref('');

// Composables
const { mutateAsync: saveWorkflow, isPending: isSaving } = useUpdateWorkflow(
  () => props.workspaceId,
);
const { mutateAsync: publishWorkflow, isPending: isPublishing } = usePublishWorkflow(
  () => props.workspaceId,
);
const { mutateAsync: createRun, isPending: isCreatingRun } = useCreateWorkflowRun(
  () => props.workspaceId,
  () => props.workflow.id,
);

// Computed
const isPublished = computed(() => props.workflow.publishedDefinition !== null);
// The run always executes the last published definition, so a drift between
// it and the live canvas means "Run" would silently use stale behavior.
const hasUnpublishedChanges = computed(
  () =>
    !isExecutionEquivalent(props.draftDefinition, props.workflow.publishedDefinition),
);
const isBusy = computed(
  () => isSaving.value || isPublishing.value || isCreatingRun.value,
);

// Functions
async function startRun() {
  const response = await createRun(input.value.trim() || undefined);
  open.value = false;
  input.value = '';
  await navigateTo(`/workflow/${props.workflow.id}/run/${response.run.id}`);
}

async function handleRun() {
  try {
    await startRun();
  } catch {
    // createRun's onError already surfaced a toast; keep the dialog open.
  }
}

async function handlePublishAndRun() {
  try {
    await saveWorkflow({
      workflowId: props.workflow.id,
      name: props.workflow.name,
      description: props.workflow.description ?? undefined,
      definition: props.draftDefinition,
    });
    await publishWorkflow(props.workflow.id);
    await startRun();
  } catch {
    // Save/publish mutations already surface a toast on failure; a failed
    // publish stops here so no run is started against a stale definition.
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Run workflow</DialogTitle>
        <DialogDescription>
          Optionally provide an input for the trigger node.
        </DialogDescription>
      </DialogHeader>

      <Alert v-if="hasUnpublishedChanges" class="border-amber-500/50 text-amber-600">
        <TriangleAlertIcon />
        <AlertTitle>Unpublished changes</AlertTitle>
        <AlertDescription>
          {{
            isPublished
              ? 'Running now uses the last published version, not your latest changes.'
              : 'This workflow has never been published. Publish it to run your changes.'
          }}
        </AlertDescription>
      </Alert>

      <Textarea v-model="input" rows="4" placeholder="Input (optional)" />

      <DialogFooter>
        <Button variant="secondary" @click="open = false">Cancel</Button>
        <Button
          v-if="hasUnpublishedChanges && isPublished"
          variant="outline"
          :disabled="isBusy"
          @click="handleRun"
        >
          Run published version
        </Button>
        <Button
          :disabled="isBusy"
          @click="hasUnpublishedChanges ? handlePublishAndRun() : handleRun()"
        >
          <Spinner v-if="isBusy" class="mr-2" />
          {{ hasUnpublishedChanges ? 'Publish & run' : 'Run' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
