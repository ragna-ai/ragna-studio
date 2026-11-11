<script setup lang="ts">
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';

interface SidebarItemProps {
  to: string;
  icon: string;
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
      <Tooltip :disabled="!props.collapsed">
        <TooltipTrigger as-child>
          <NuxtLinkLocale
            :to="props.to"
            class="sidebar-row"
            :class="{ 'sidebar-row-active': isActive }"
            :aria-label="props.label"
          >
            <Icon :name="`hugeicons:${props.icon}`" class="sidebar-row-icon" />
            <span v-if="!props.collapsed" class="truncate">
              {{ props.label }}
            </span>
          </NuxtLinkLocale>
        </TooltipTrigger>
        <TooltipContent side="right">
          {{ props.label }}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </li>
</template>
