<script setup lang="ts">
defineProps<{
  title: string | undefined | null;
  subtitle?: string;
}>();
</script>

<template>
  <div class="flex w-full items-center justify-between">
    <div class="">
      <h1 class="max-w-lg truncate text-xl font-bold">
        {{ title ?? '' }}
      </h1>
      <p class="max-w-2xl truncate text-sm opacity-90">
        {{ subtitle ?? '' }}
      </p>
    </div>
    <div>
      <slot name="button" />
    </div>
  </div>
</template>
