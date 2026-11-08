<script setup lang="ts">
defineProps<{ crumbs?: PageCrumb[] }>();
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <slot name="header">
      <NavTopBar :crumbs="crumbs" />
    </slot>
    <main
      id="main"
      class="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
    >
      <slot />
    </main>
  </div>
</template>
