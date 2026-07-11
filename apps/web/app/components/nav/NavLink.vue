<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  to: string;
  icon: Component;
  label: string;
  labelVisible?: boolean;
}>();
</script>

<template>
  <NuxtLinkLocale
    :to="to"
    class="group flex flex-col items-center rounded-lg border border-transparent px-4 py-0 transition-colors"
    :activeClass="undefined"
    exactActiveClass="nav-link-active"
  >
    <div class="nav-icon-wrapper">
      <component :is="icon" class="nav-icon stroke-1.5" />
    </div>
    <span class="nav-icon-text truncate px-4 pt-0 text-foreground">
      {{ label }}
    </span>
  </NuxtLinkLocale>
</template>
