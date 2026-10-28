<script setup lang="ts">
import { TriangleAlertIcon } from '@lucide/vue';
import type { WorkflowDefinition } from '@repo/workflow';
import { isExecutionEquivalent } from '@repo/workflow';
import { toast } from 'vue-sonner';
import {
  useCreateWorkflowRun,
  usePublishWorkflow,
  useUpdateWorkflow,
} from '~/features/workflow/composables/useWorkflowApi';
import { getBlockingMessage } from '~/features/workflow/lib/validate-draft';
import type { Workflow } from '~/features/workflow/types';
import { WORKFLOW_VALIDATION_KEY } from '~/features/workflow/types/validation';

// Imports

// Props
const props = defineProps<{
  workflow: Workflow;
  draftDefinition: WorkflowDefinition;
}>();

// Emits
const emit = defineEmits<{
  (e: 'publish-blocked'): void;
}>();

// Refs
const open = defineModel<boolean>('open', { default: false });
const input = ref('');

// Composables
const { mutateAsync: saveWorkflow, isPending: isSaving } = useUpdateWorkflow();
const { mutateAsync: publishWorkflow, isPending: isPublishing } =
  usePublishWorkflow();
const { mutateAsync: createRun, isPending: isCreatingRun } =
  useCreateWorkflowRun(() => props.workflow.id);
const validation = inject(WORKFLOW_VALIDATION_KEY, null);
const { t } = useI18n();

// Computed
const isPublished = computed(() => props.workflow.publishedDefinition !== null);
// The run always executes the last published definition, so a drift between
// it and the live canvas means "Run" would silently use stale behavior.
const hasUnpublishedChanges = computed(
  () =>
    !isExecutionEquivalent(
      props.draftDefinition,
      props.workflow.publishedDefinition,
    ),
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

function isPublishBlocked(): boolean {
  if (!validation || validation.value.canPublish) {
    return false;
  }
  const { messageKey, count } = getBlockingMessage(validation.value);
  toast.error(t(messageKey, { count }, count));
  open.value = false;
  emit('publish-blocked');
  return true;
}

async function handlePublishAndRun() {
  if (isPublishBlocked()) {
    return;
  }
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
        <DialogTitle>{{ t('workflow.runDialog.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('workflow.runDialog.subtitle') }}
        </DialogDescription>
      </DialogHeader>

      <Alert
        v-if="hasUnpublishedChanges"
        class="border-amber-500/50 text-amber-600"
      >
        <TriangleAlertIcon />
        <AlertTitle>{{ t('workflow.editor.unpublishedChanges') }}</AlertTitle>
        <AlertDescription>
          {{
            isPublished
              ? t('workflow.runDialog.unpublishedChangesPublished')
              : t('workflow.runDialog.unpublishedChangesUnpublished')
          }}
        </AlertDescription>
      </Alert>

      <Textarea
        v-model="input"
        rows="4"
        :placeholder="t('workflow.runDialog.inputPlaceholder')"
      />

      <DialogFooter>
        <Button variant="secondary" @click="open = false">{{
          t('common.cancel')
        }}</Button>
        <Button
          v-if="hasUnpublishedChanges && isPublished"
          variant="outline"
          :disabled="isBusy"
          @click="handleRun"
        >
          {{ t('workflow.runDialog.runPublished') }}
        </Button>
        <Button
          :disabled="isBusy"
          @click="hasUnpublishedChanges ? handlePublishAndRun() : handleRun()"
        >
          <Spinner v-if="isBusy" class="mr-2" />
          {{
            hasUnpublishedChanges
              ? t('workflow.runDialog.publishAndRun')
              : t('common.run')
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
