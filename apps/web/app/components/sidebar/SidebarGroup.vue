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
  <div>
    <template v-if="props.label">
      <p
        v-if="!props.collapsed"
        class="my-0.5 flex h-9 items-end pb-1.5 pl-3 font-mono text-caption font-medium tracking-[0.04em] text-muted-foreground uppercase"
      >
        {{ props.label }}
      </p>
      <div
        v-else
        aria-hidden="true"
        class="my-0.5 flex h-9 items-end justify-center pb-2"
      >
        <span class="h-px w-4 bg-border-strong" />
      </div>
    </template>
    <ul class="space-y-0.5">
      <slot />
    </ul>
  </div>
</template>
