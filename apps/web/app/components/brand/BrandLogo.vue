<script setup lang="ts">
const { textVisible = true } = defineProps<{ textVisible?: boolean }>();
</script>

<template>
  <NuxtLink to="/" class="flex items-center gap-2 px-1">
    <span v-if="textVisible" class="text-sm font-medium tracking-wide">
      RAGNA Studio
    </span>
  </NuxtLink>
</template>
