<script setup lang="ts">
const { textVisible = true } = defineProps<{ textVisible?: boolean }>();
</script>

<template>
  <NuxtLink
    to="/"
    class="flex h-8 items-center gap-2"
    :class="textVisible ? 'pl-2' : 'justify-center'"
    aria-label="RAGNA Studio"
  >
    <img src="/favicon.png" alt="" class="size-5 shrink-0" />
    <span v-if="textVisible" class="truncate text-sm font-semibold">
      RAGNA Studio
    </span>
  </NuxtLink>
</template>
