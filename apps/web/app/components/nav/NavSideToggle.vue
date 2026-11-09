<script setup lang="ts">
import { Button } from '~/components/ui/button';

const navSidebarStore = useNavSidebarStore();
const label = computed(() =>
  navSidebarStore.expanded ? 'nav.collapseSidebar' : 'nav.expandSidebar',
);
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    class="text-icon"
    :title="$t(label)"
    :aria-label="$t(label)"
    @click="navSidebarStore.toggleExpanded()"
  >
    <Icon name="hugeicons:sidebar-left" class="size-4" />
  </Button>
</template>
