<script setup lang="ts">
interface ListTitleCellProps {
  title: string;
  /** Makes the title a link, so the row has a keyboard target. */
  to?: string;
  description?: string;
}

defineProps<ListTitleCellProps>();
</script>

<template>
  <div class="flex min-w-0 items-center gap-3">
    <slot name="lead" />
    <div class="flex min-w-0 flex-col">
      <NuxtLinkLocale
        v-if="to"
        :to="to"
        class="truncate text-body focus-visible:underline focus-visible:outline-hidden"
        @click.stop
      >
        {{ title }}
      </NuxtLinkLocale>
      <span v-else class="truncate text-body">{{ title }}</span>
      <span
        v-if="description"
        class="truncate text-small text-muted-foreground"
      >
        {{ description }}
      </span>
    </div>
  </div>
</template>
