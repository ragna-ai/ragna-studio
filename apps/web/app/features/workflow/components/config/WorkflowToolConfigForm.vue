<script setup lang="ts">
import { WORKFLOW_TOOLS, type WorkflowNode } from '@repo/workflow';
import WorkflowTemplateHint from '~/features/workflow/components/WorkflowTemplateHint.vue';
import { NODE_TYPE_LABEL_KEYS } from '~/features/workflow/types/node-data';

// Imports

// Props
// The panel only renders this form when node.type === 'tool', so the
// narrowed node (and therefore its config) is guaranteed to be ToolConfig.
defineProps<{
  node: Extract<WorkflowNode, { type: 'tool' }>;
}>();

// Composables
const { t } = useI18n();
</script>

<template>
  <div class="space-y-4">
    <div>
      <Label class="mb-2 block text-sm font-medium">{{
        t(NODE_TYPE_LABEL_KEYS.tool)
      }}</Label>
      <Select v-model="node.data.config.tool">
        <SelectTrigger class="w-full">
          <SelectValue :placeholder="t('workflow.toolConfig.selectTool')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="tool in WORKFLOW_TOOLS" :key="tool" :value="tool">
            {{ tool }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div>
      <Label class="mb-2 block text-sm font-medium">{{
        t('common.input')
      }}</Label>
      <Textarea v-model="node.data.config.input" rows="6" />
      <WorkflowTemplateHint class="mt-1" />
    </div>
  </div>
</template>
