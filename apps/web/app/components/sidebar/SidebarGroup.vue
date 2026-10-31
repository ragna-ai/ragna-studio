<script setup lang="ts">
interface SidebarGroupProps {
  label?: string;
  collapsed?: boolean;
}

const props = withDefaults(defineProps<SidebarGroupProps>(), {
  label: undefined,
  collapsed: false,
});
</script>

<template>
  <div :class="props.collapsed ? 'mt-3 first:mt-0' : 'mt-6 first:mt-0'">
    <p
      v-if="props.label && !props.collapsed"
      class="px-2 pb-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
    >
      {{ props.label }}
    </p>
    <ul class="space-y-0.5">
      <slot />
    </ul>
  </div>
</template>
