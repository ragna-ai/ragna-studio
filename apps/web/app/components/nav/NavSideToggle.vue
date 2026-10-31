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
    :class="{ 'w-fit': navSidebarStore.expanded }"
    :title="$t(label)"
    :aria-label="$t(label)"
    @click="navSidebarStore.toggleExpanded()"
  >
    <PanelLeftCloseIcon
      v-if="navSidebarStore.expanded"
      class="sidebar-row-icon"
    />
    <PanelLeftOpenIcon v-else class="sidebar-row-icon" />
  </button>
</template>
