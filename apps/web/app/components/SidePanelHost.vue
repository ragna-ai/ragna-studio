<script setup lang="ts">
import type { Component } from 'vue';
import {
  useSidePanelStore,
  type SidePanelView,
} from '~/stores/sidepanel.store';

// A view only needs to know which component to render and which route area
// it belongs to, so the panel can close itself when navigation leaves that
// area. Keyed by SidePanelView so adding a view without an entry here is a
// type error instead of a silent no-op.
interface SidePanelEntry {
  component: Component;
  routePrefix: string;
}

const views: Record<SidePanelView, SidePanelEntry> = {
  'chat-history': {
    component: defineAsyncComponent(
      () => import('~/features/chat/components/ChatHistoryPanel.vue'),
    ),
    routePrefix: '/chat',
  },
};

// Composables
const sidePanel = useSidePanelStore();
const route = useRoute();

// Computed
const activeEntry = computed<SidePanelEntry | null>(() =>
  sidePanel.view ? views[sidePanel.view] : null,
);

// Hooks
watch(
  () => route.path,
  (path) => {
    if (activeEntry.value && !path.startsWith(activeEntry.value.routePrefix)) {
      sidePanel.close();
    }
  },
  { immediate: true },
);
</script>

<template>
  <Transition name="side-panel">
    <div v-if="activeEntry" class="w-68 shrink-0 overflow-hidden">
      <div class="h-full overflow-y-auto p-2">
        <component :is="activeEntry.component" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.side-panel-enter-active,
.side-panel-leave-active {
  transition:
    width 0.3s ease,
    opacity 0.3s ease;
}

.side-panel-enter-from,
.side-panel-leave-to {
  width: 0;
  opacity: 0;
}
</style>
