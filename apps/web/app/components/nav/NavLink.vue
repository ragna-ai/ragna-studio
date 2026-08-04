<script setup lang="ts">
import type { Component } from 'vue';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';

const props = withDefaults(
  defineProps<{
    to: string;
    icon: Component;
    label: string;
    expanded?: boolean;
    labelVisible?: boolean;
  }>(),
  {
    expanded: false,
    labelVisible: true,
  },
);

const route = useRoute();
const isActive = computed(() => {
  if (props.to === '/') return route.path === '/';
  return route.path === props.to || route.path.startsWith(`${props.to}/`);
});

// Tooltips only make sense for the icon-only collapsed state: the
// expanded sidebar always shows the label next to the icon.
const showTooltip = computed(() => !props.expanded && !props.labelVisible);
</script>

<template>
  <TooltipProvider v-if="showTooltip" :delay-duration="300">
    <Tooltip>
      <TooltipTrigger as-child>
        <NuxtLinkLocale
          :to="props.to"
          class="nav-link group"
          :class="{ 'nav-link-active': isActive }"
          activeClass="nav-link-active"
          exactActiveClass="nav-link-active"
        >
          <div class="nav-icon-wrapper">
            <component :is="props.icon" class="nav-icon" />
          </div>
          <span class="nav-icon-text truncate px-4 pt-0 text-foreground">
            {{ props.label }}
          </span>
        </NuxtLinkLocale>
      </TooltipTrigger>
      <TooltipContent side="right">
        {{ props.label }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <NuxtLinkLocale
    v-else
    :to="props.to"
    class="nav-link group"
    :class="{ 'nav-link-active': isActive, 'nav-link-expanded': props.expanded }"
    activeClass="nav-link-active"
    exactActiveClass="nav-link-active"
  >
    <div class="nav-icon-wrapper">
      <component :is="props.icon" class="nav-icon" />
    </div>
    <span class="nav-icon-text truncate px-4 pt-0 text-foreground">
      {{ props.label }}
    </span>
  </NuxtLinkLocale>
</template>
