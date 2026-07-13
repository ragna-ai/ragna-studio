<script setup lang="ts">
// Vue interpolation ends at the first '}}', so the raw placeholder cannot
// be written inline in the template.
const inputPlaceholder = '{{input}}';
</script>

<template>
  <p class="text-xs text-muted-foreground">
    <code class="rounded bg-muted px-1">{{ inputPlaceholder }}</code> is this node's input, i.e.
    the previous node's output (the run input for the first node).
  </p>
</template>
