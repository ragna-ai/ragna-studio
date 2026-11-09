<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '~/lib/utils';

interface SidebarShellProps {
  collapsed?: boolean;
  class?: HTMLAttributes['class'];
}

const props = withDefaults(defineProps<SidebarShellProps>(), {
  collapsed: false,
  class: undefined,
});
</script>

<template>
  <aside
    :data-collapsed="props.collapsed"
    :class="
      cn(
        'relative flex h-full shrink-0 flex-col transition-[width] duration-200 ease-out motion-reduce:transition-none',
        props.collapsed
          ? 'w-(--sidebar-width-collapsed)'
          : 'w-(--sidebar-width)',
        props.class,
      )
    "
  >
    <div class="shrink-0 px-2">
      <slot name="header" />
    </div>
    <div class="-my-1 min-h-0 grow overflow-y-auto px-2 py-1">
      <slot />
    </div>
    <div class="shrink-0 px-2">
      <slot name="footer" />
    </div>
  </aside>
</template>
