<script setup lang="ts">
import { useCreateWorkflowRun } from '~/features/workflow/composables/useWorkflowApi';

// Imports

// Props
const props = defineProps<{
  workflowId: string;
}>();

// Refs
const open = defineModel<boolean>('open', { default: false });
const input = ref('');

// Composables
const { mutateAsync: createRun, isPending } = useCreateWorkflowRun(
  () => props.workflowId,
);

// Functions
async function handleRun() {
  try {
    const response = await createRun(input.value.trim() || undefined);
    open.value = false;
    input.value = '';
    await navigateTo(`/workflow/${props.workflowId}/run/${response.run.id}`);
  } catch {
    // The mutation's onError already surfaced a toast; keep the dialog open
    // so the user can retry.
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

      <Textarea v-model="input" rows="4" placeholder="Input (optional)" />

      <DialogFooter>
        <Button variant="secondary" @click="open = false">Cancel</Button>
        <Button :disabled="isPending" @click="handleRun">
          <Spinner v-if="isPending" class="mr-2" />
          Run
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
