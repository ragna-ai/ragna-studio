<script setup lang="ts">
import type { Component } from 'vue';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';

interface SidebarItemProps {
  to: string;
  icon: Component;
  label: string;
  collapsed?: boolean;
  exact?: boolean;
}

const props = withDefaults(defineProps<SidebarItemProps>(), {
  collapsed: false,
  exact: false,
});

const route = useRoute();
const isActive = computed(() => {
  if (props.exact || props.to === '/') return route.path === props.to;
  return route.path === props.to || route.path.startsWith(`${props.to}/`);
});
</script>

<template>
  <li>
    <TooltipProvider :delay-duration="300">
      <Tooltip>
        <TooltipTrigger as-child>
          <NuxtLinkLocale
            :to="props.to"
            class="sidebar-row"
            :class="{ 'sidebar-row-active': isActive }"
            :aria-label="props.label"
          >
            <component :is="props.icon" class="sidebar-row-icon" />
            <span v-if="!props.collapsed" class="truncate">
              {{ props.label }}
            </span>
          </NuxtLinkLocale>
        </TooltipTrigger>
        <TooltipContent v-if="props.collapsed" side="right">
          {{ props.label }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </li>
</template>
