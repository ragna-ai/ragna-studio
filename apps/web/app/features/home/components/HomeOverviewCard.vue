<script setup lang="ts">
interface HomeOverviewCardProps {
  icon: string;
  title: string;
  total: number;
  viewAllTo?: string;
  actionLabel?: string;
  loading?: boolean;
  isEmpty?: boolean;
  emptyLabel?: string;
  quickCreateLabel?: string;
  quickCreateTo?: string;
}

withDefaults(defineProps<HomeOverviewCardProps>(), {
  viewAllTo: undefined,
  actionLabel: undefined,
  loading: false,
  isEmpty: false,
  emptyLabel: '',
  quickCreateLabel: undefined,
  quickCreateTo: undefined,
});
</script>

<template>
  <section
    :aria-label="title"
    class="rounded-lg border bg-card px-(--inset-card) pt-4 pb-2"
  >
    <header class="mb-1 flex h-8 items-center gap-2">
      <Icon :name="icon" class="size-4 shrink-0 text-icon" />
      <h2 class="truncate text-title-sm font-semibold">{{ title }}</h2>
      <span class="font-mono text-caption text-muted-foreground">{{
        total
      }}</span>
      <span class="grow" />
      <NuxtLinkLocale
        v-if="viewAllTo && actionLabel"
        :to="viewAllTo"
        class="-mr-2 flex shrink-0 items-center gap-0.5 rounded-md px-2 py-1 text-body font-medium text-muted-foreground transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {{ actionLabel }}
        <Icon name="hugeicons:arrow-right-01" class="size-3.5" />
      </NuxtLinkLocale>
    </header>

    <div v-if="loading">
      <div v-for="n in 3" :key="n" class="flex h-11 items-center border-t">
        <Skeleton class="h-4 w-full" />
      </div>
    </div>
    <div v-else-if="isEmpty" class="border-t py-3">
      <p class="text-body text-muted-foreground">{{ emptyLabel }}</p>
      <NuxtLinkLocale
        v-if="quickCreateLabel && quickCreateTo"
        :to="quickCreateTo"
        class="mt-2 -ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-body font-medium text-foreground transition-colors hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Icon name="hugeicons:add-01" class="size-4 text-icon" />
        {{ quickCreateLabel }}
      </NuxtLinkLocale>
    </div>
    <slot v-else />
  </section>
</template>
