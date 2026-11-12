<script setup lang="ts">
defineProps<{
  title: string | undefined | null;
  subtitle?: string;
}>();
</script>

<template>
  <header class="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
    <div class="flex min-w-0 flex-col gap-1.5">
      <!-- Pages that show a breadcrumb trail (e.g. a detail page's parent
           list + its own name) pass #title to replace the plain <h1> with
           it, in place, so no extra bar/row is added. -->
      <slot name="title">
        <h1 class="text-title font-semibold">
          {{ title ?? '' }}
        </h1>
      </slot>
      <p v-if="subtitle" class="text-body text-muted-foreground">
        {{ subtitle }}
      </p>
    </div>
    <div class="flex gap-2">
      <slot name="button" />
    </div>
  </header>
</template>
