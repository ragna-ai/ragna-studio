<script setup lang="ts">
import { NuxtLinkLocale } from '#components';

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
  <Card role="region" :aria-label="title">
    <CardHeader>
      <Icon :name="icon" class="size-4 shrink-0 text-icon" />
      <CardTitle class="truncate">{{ title }}</CardTitle>
      <span class="font-mono text-caption text-muted-foreground">{{
        total
      }}</span>
      <CardAction v-if="viewAllTo && actionLabel">
        <Button
          :as="NuxtLinkLocale"
          :to="viewAllTo"
          variant="ghost"
          size="sm"
          class="text-muted-foreground"
          trailing-icon="hugeicons:arrow-right-01"
        >
          {{ actionLabel }}
        </Button>
      </CardAction>
    </CardHeader>

    <CardContent v-if="loading">
      <div v-for="n in 3" :key="n" class="flex h-11 items-center border-t">
        <Skeleton class="h-4 w-full" />
      </div>
    </CardContent>
    <CardContent v-else-if="isEmpty" class="border-t py-3">
      <p class="text-body text-muted-foreground">{{ emptyLabel }}</p>
      <Button
        v-if="quickCreateLabel && quickCreateTo"
        :as="NuxtLinkLocale"
        :to="quickCreateTo"
        variant="ghost"
        size="sm"
        class="mt-2 -ml-2"
        leading-icon="hugeicons:add-01"
      >
        {{ quickCreateLabel }}
      </Button>
    </CardContent>
    <CardContent v-else class="flex flex-col">
      <slot />
    </CardContent>
  </Card>
</template>
