<script setup lang="ts">
type AgentMemoryPanelProps = {
  loading: boolean;
};

// Props
defineProps<AgentMemoryPanelProps>();

// Refs
const content = defineModel<string>({ required: true });
</script>

<template>
  <div v-if="loading" class="flex items-center justify-center py-12">
    <Spinner />
  </div>
  <div v-else class="flex flex-col gap-2">
    <Label class="block text-sm font-medium" for="agent-memory-content">
      {{ $t('agent.upsert.memoryLabel') }}
    </Label>
    <Textarea
      id="agent-memory-content"
      v-model="content"
      rows="12"
      autocomplete="off"
    />
  </div>
</template>
