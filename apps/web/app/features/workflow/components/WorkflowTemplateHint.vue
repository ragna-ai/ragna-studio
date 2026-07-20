<script setup lang="ts">
// Vue interpolation ends at the first '}}', so the raw placeholder cannot
// be written inline in the template.
const inputPlaceholder = '{{input}}';

// Composables
const { t } = useI18n();
</script>

<template>
  <p class="text-xs text-muted-foreground">
    <code class="rounded bg-muted px-1">{{ inputPlaceholder }}</code>
    {{ t('workflow.templateHint') }}
  </p>
</template>
