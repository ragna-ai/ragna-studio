<script setup lang="ts">
import { WORKFLOW_TOOLS, type WorkflowNode } from '@repo/workflow';
import WorkflowTemplateHint from '~/features/workflow/components/WorkflowTemplateHint.vue';

// Imports

// Props
// The panel only renders this form when node.type === 'tool', so the
// narrowed node (and therefore its config) is guaranteed to be ToolConfig.
defineProps<{
  node: Extract<WorkflowNode, { type: 'tool' }>;
}>();
</script>

<template>
  <div class="space-y-4">
    <div>
      <Label class="mb-2 block text-sm font-medium">Tool</Label>
      <Select v-model="node.data.config.tool">
        <SelectTrigger class="w-full">
          <SelectValue placeholder="Select a tool" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="tool in WORKFLOW_TOOLS" :key="tool" :value="tool">
            {{ tool }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div>
      <Label class="mb-2 block text-sm font-medium">Input</Label>
      <Textarea v-model="node.data.config.input" rows="6" />
      <WorkflowTemplateHint class="mt-1" />
    </div>
  </div>
</template>
