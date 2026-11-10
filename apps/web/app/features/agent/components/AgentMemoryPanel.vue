<script setup lang="ts">
import MarkdownEditorField from '~/components/editor/MarkdownEditorField.vue';

type AgentMemoryPanelProps = {
  loading: boolean;
};

// Props
defineProps<AgentMemoryPanelProps>();

// Refs
const content = defineModel<string>({ required: true });

// Composables
const { t } = useI18n();
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-12">
    <Spinner />
  </div>
  <div v-else class="flex min-h-80 flex-col">
    <MarkdownEditorField
      v-model="content"
      aria-labelledby="agent-memory-label"
      :placeholder="t('agent.upsert.memoryPlaceholder')"
      :panel-title="t('agent.upsert.memoryLabel')"
      class="min-h-60"
    >
      <template #label>
        <Label id="agent-memory-label" class="block text-sm font-medium">
          {{ t('agent.upsert.memoryLabel') }}
        </Label>
      </template>
    </MarkdownEditorField>
  </div>
</template>
