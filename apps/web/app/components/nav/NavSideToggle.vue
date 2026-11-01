<script setup lang="ts">
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from '@lucide/vue';

const navSidebarStore = useNavSidebarStore();
const label = computed(() =>
  navSidebarStore.expanded ? 'nav.collapseSidebar' : 'nav.expandSidebar',
);
</script>

<template>
  <button
    type="button"
    class="sidebar-row"
    :title="$t(label)"
    :aria-label="$t(label)"
    @click="navSidebarStore.toggleExpanded()"
  >
    <template v-if="navSidebarStore.expanded">
      <PanelLeftCloseIcon class="sidebar-row-icon" />
      <span class="truncate">{{ $t(label) }}</span>
    </template>
    <PanelLeftOpenIcon v-else class="sidebar-row-icon" />
  </button>
</template>
