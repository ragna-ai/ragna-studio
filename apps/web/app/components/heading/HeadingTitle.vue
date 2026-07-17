<script setup lang="ts">
defineProps<{
  title: string | undefined | null;
  subtitle?: string;
}>();
</script>

<template>
  <div class="flex w-full items-center justify-between">
    <div class="">
      <!-- Pages that show a breadcrumb trail (e.g. a detail page's parent
           list + its own name) pass #title to replace the plain <h1> with
           it, in place, so no extra bar/row is added. -->
      <slot name="title">
        <h1 class="max-w-lg truncate text-xl font-bold">
          {{ title ?? '' }}
        </h1>
      </slot>
      <p class="max-w-2xl truncate text-sm opacity-90">
        {{ subtitle ?? '' }}
      </p>
    </div>
    <div>
      <slot name="button" />
    </div>
  </div>
</template>
