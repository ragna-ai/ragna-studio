<script setup lang="ts">
import { CONDITION_OPERATORS, type WorkflowNode } from '@repo/workflow';
import WorkflowTemplateHint from '~/features/workflow/components/WorkflowTemplateHint.vue';

// Imports

// Props
// The panel only renders this form when node.type === 'condition', so the
// narrowed node (and therefore its config) is guaranteed to be ConditionConfig.
const props = defineProps<{
  node: Extract<WorkflowNode, { type: 'condition' }>;
}>();

// Computed
const needsRightOperand = computed(
  () => props.node.data.config.operator !== 'isEmpty' && props.node.data.config.operator !== 'isNotEmpty',
);
</script>

<template>
  <div class="space-y-4">
    <div>
      <Label class="mb-2 block text-sm font-medium">Left</Label>
      <Input v-model="node.data.config.left" />
      <WorkflowTemplateHint class="mt-1" />
    </div>

    <div>
      <Label class="mb-2 block text-sm font-medium">Operator</Label>
      <Select v-model="node.data.config.operator">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="operator in CONDITION_OPERATORS" :key="operator" :value="operator">
            {{ operator }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="needsRightOperand">
      <Label class="mb-2 block text-sm font-medium">Right</Label>
      <Input v-model="node.data.config.right" />
      <WorkflowTemplateHint class="mt-1" />
    </div>

    <p class="text-xs text-muted-foreground">
      The two edges leaving this node are labeled "true" and "false"; connect each to the
      branch that should run.
    </p>
  </div>
</template>
