<script setup lang="ts">
interface PagePanelProps {
  crumbs?: PageCrumb[];
  /** The page fills the panel and scrolls its own regions; the panel never scrolls. */
  fill?: boolean;
}

defineProps<PagePanelProps>();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <slot name="header">
      <NavTopBar :crumbs="crumbs" />
    </slot>
    <main
      id="main"
      class="relative min-h-0 flex-1"
      :class="fill ? 'overflow-clip' : 'overflow-x-hidden overflow-y-auto'"
    >
      <slot />
    </main>
  </div>
</template>
