<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  to: string;
  icon: Component;
  label: string;
  exact?: boolean;
}>();
</script>

<template>
  <NuxtLink
    :to="to"
    :exact-active-class="'bg-stone-100'"
    :active-class="exact ? '' : 'bg-stone-100'"
    class="flex w-full flex-col items-center justify-center gap-1 rounded-lg py-2 text-stone-600 transition-colors hover:bg-stone-100"
  >
    <component :is="icon" class="stroke-1.5 size-5" />
    <span class="text-[10px] font-medium leading-none">{{ label }}</span>
  </NuxtLink>
</template>
