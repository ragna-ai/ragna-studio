<script setup lang="ts">
// Vue interpolation ends at the first '}}', so the raw placeholders
// cannot be written inline in the template.
const inputPlaceholder = '{{input}}';
const nodePlaceholder = '{{nodes.<nodeId>}}';
</script>

<template>
  <p class="text-xs text-muted-foreground">
    Supports <code class="rounded bg-muted px-1">{{ inputPlaceholder }}</code> (run input) and
    <code class="rounded bg-muted px-1">{{ nodePlaceholder }}</code> (an upstream node's output).
  </p>
</template>
