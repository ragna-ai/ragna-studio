<script setup lang="ts">
import type { WorkflowNode } from '@repo/workflow';
import { Trash2Icon, XIcon } from '@lucide/vue';
import WorkflowAgentConfigForm from '~/features/workflow/components/config/WorkflowAgentConfigForm.vue';
import WorkflowConditionConfigForm from '~/features/workflow/components/config/WorkflowConditionConfigForm.vue';
import WorkflowTeamConfigForm from '~/features/workflow/components/config/WorkflowTeamConfigForm.vue';
import WorkflowToolConfigForm from '~/features/workflow/components/config/WorkflowToolConfigForm.vue';
import WorkflowTransformConfigForm from '~/features/workflow/components/config/WorkflowTransformConfigForm.vue';
import WorkflowTriggerConfigForm from '~/features/workflow/components/config/WorkflowTriggerConfigForm.vue';
import { NODE_TYPE_LABEL_KEYS } from '~/features/workflow/types/node-data';

// Imports

// Props
// `node` is a reference into the canvas's own nodes array (found by id), not
// a copy, so editing its fields here updates the canvas live and Save
// serializes exactly what's shown.
defineProps<{
  node: WorkflowNode;
}>();

// Emits
const emit = defineEmits<{
  (e: 'delete'): void;
  (e: 'close'): void;
}>();

// Composables
const { t } = useI18n();
</script>

<template>
  <aside
    class="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l bg-card p-4"
  >
    <div class="flex items-center justify-between">
      <Badge variant="outline">{{ t(NODE_TYPE_LABEL_KEYS[node.type]) }}</Badge>
      <div class="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('workflow.configPanel.deleteNode')"
          @click="emit('delete')"
        >
          <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          :aria-label="t('workflow.configPanel.closePanel')"
          @click="emit('close')"
        >
          <XIcon class="size-4 stroke-1.5" />
        </Button>
      </div>
    </div>

    <div>
      <Label class="mb-2 block text-sm font-medium">{{
        t('workflow.configPanel.labelField')
      }}</Label>
      <Input v-model="node.data.label" />
    </div>

    <Separator />

    <WorkflowTriggerConfigForm v-if="node.type === 'trigger'" :node="node" />
    <WorkflowAgentConfigForm v-else-if="node.type === 'agent'" :node="node" />
    <WorkflowToolConfigForm v-else-if="node.type === 'tool'" :node="node" />
    <WorkflowConditionConfigForm
      v-else-if="node.type === 'condition'"
      :node="node"
    />
    <WorkflowTransformConfigForm
      v-else-if="node.type === 'transform'"
      :node="node"
    />
    <WorkflowTeamConfigForm v-else-if="node.type === 'team'" :node="node" />
  </aside>
</template>
