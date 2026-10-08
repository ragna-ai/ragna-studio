<script setup lang="ts">
import type { WorkflowNode } from '@repo/workflow';
import WorkflowTemplateHint from '~/features/workflow/components/WorkflowTemplateHint.vue';

// Imports

// Props
// The panel only renders this form when node.type === 'transform', so the
// narrowed node (and therefore its config) is guaranteed to be TransformConfig.
defineProps<{
  node: Extract<WorkflowNode, { type: 'transform' }>;
}>();

// Composables
const { t } = useI18n();
</script>

<template>
  <div class="space-y-4">
    <div>
      <Label class="mb-2 block text-sm font-medium">{{
        t('workflow.transformConfig.templateLabel')
      }}</Label>
      <Textarea v-model="node.data.config.template" rows="6" />
      <WorkflowTemplateHint class="mt-1" />
    </div>
  </div>
</template>
