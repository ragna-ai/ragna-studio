<script setup lang="ts">
const navSidebarStore = useNavSidebarStore();
const label = computed(() =>
  navSidebarStore.expanded ? 'nav.collapseSidebar' : 'nav.expandSidebar',
);
</script>

<template>
  <button
    type="button"
    class="flex size-8 shrink-0 items-center justify-center rounded-md text-icon transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden"
    :title="$t(label)"
    :aria-label="$t(label)"
    @click="navSidebarStore.toggleExpanded()"
  >
    <Icon name="hugeicons:sidebar-left" class="size-4" />
  </button>
</template>
