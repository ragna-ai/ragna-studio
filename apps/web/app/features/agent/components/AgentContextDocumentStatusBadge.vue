<script setup lang="ts">
// Imports
import type { AgentContextDocumentStatus } from '~/features/agent/types';

// Props
const props = defineProps<{
  status: AgentContextDocumentStatus;
}>();

// Computed
// Local tones on the status tokens; badge status tones are planned globally in #320.
const toneClassByStatus: Record<AgentContextDocumentStatus, string> = {
  pending: 'bg-status-neutral-bg text-status-neutral-fg',
  ready: 'bg-status-ok-bg text-status-ok-fg',
  failed: 'bg-status-danger-bg text-status-danger-fg',
};

const toneClass = computed(() => toneClassByStatus[props.status]);
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
    :class="toneClass"
  >
    <Spinner v-if="status === 'pending'" class="size-3" />
    <span
      v-else-if="status === 'ready'"
      class="size-1.5 rounded-full bg-status-ok"
    />
    {{ $t(`agent.context.status.${status}`) }}
  </span>
</template>
