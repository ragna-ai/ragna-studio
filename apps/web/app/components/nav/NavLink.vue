<script setup lang="ts">
import type { Component } from 'vue';

const props = defineProps<{
  to: string;
  icon: Component;
  label: string;
}>();

const route = useRoute();
const isActive = computed(() => {
  if (props.to === '/') return route.path === '/';
  return route.path === props.to || route.path.startsWith(`${props.to}/`);
});
</script>

<template>
  <NuxtLinkLocale
    :to="props.to"
    class="group flex flex-col items-center rounded-lg border border-transparent px-4 py-0 transition-colors"
    :class="{
      'nav-link-active': isActive,
    }"
    activeClass="nav-link-active"
    exactActiveClass="nav-link-active"
  >
    <div class="nav-icon-wrapper">
      <component :is="props.icon" class="nav-icon stroke-1.5" />
    </div>
    <span class="nav-icon-text truncate px-4 pt-0 text-foreground">
      {{ props.label }}
    </span>
  </NuxtLinkLocale>
</template>
