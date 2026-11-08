<script setup lang="ts">
interface HomeOverviewRowProps {
  to?: string;
  tall?: boolean;
}

withDefaults(defineProps<HomeOverviewRowProps>(), {
  to: undefined,
  tall: false,
});

const emit = defineEmits<{ select: [] }>();

const NuxtLinkLocale = resolveComponent('NuxtLinkLocale');
</script>

<template>
  <component
    :is="to ? NuxtLinkLocale : 'button'"
    v-bind="to ? { to } : { type: 'button' }"
    class="-mx-(--inset-card) block w-[calc(100%+var(--inset-card)*2)] px-(--inset-card) text-left outline-hidden transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    @click="emit('select')"
  >
    <div
      class="flex items-center gap-3 border-t"
      :class="tall ? 'h-14' : 'h-11'"
    >
      <slot />
    </div>
  </component>
</template>
