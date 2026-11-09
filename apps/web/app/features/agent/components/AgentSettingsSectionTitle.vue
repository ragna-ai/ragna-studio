<script setup lang="ts">
type AgentSettingsSectionTitleProps = {
  title: string;
  subtitle: string;
};

// Props
defineProps<AgentSettingsSectionTitleProps>();
</script>

<template>
  <div class="flex flex-col gap-1">
    <h2 class="text-base font-semibold">{{ title }}</h2>
    <p class="text-sm text-muted-foreground">{{ subtitle }}</p>
  </div>
</template>
