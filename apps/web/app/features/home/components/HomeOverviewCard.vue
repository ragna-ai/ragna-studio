<script setup lang="ts">
import { Maximize2Icon, PlusIcon, type LucideIcon } from '@lucide/vue';

// Props
// Generic shell shared by all four overview cards (docs/home/prd.md, "Card
// shell"): icon chip + title + total badge + "view all", a slotted
// row/tile body, and a ghost quick-create row that doubles as the empty
// state. `quickCreateLabel`/`quickCreateTo` are optional because the
// Agents card builds its own dashed create tile into the body instead
// (docs/home/prd.md, "Agents card") and skips this footer entirely.
const props = withDefaults(
  defineProps<{
    icon: LucideIcon;
    iconClass: string;
    title: string;
    total: number;
    viewAllTo: string;
    loading?: boolean;
    isEmpty?: boolean;
    emptyLabel?: string;
    quickCreateLabel?: string;
    quickCreateTo?: string;
  }>(),
  {
    loading: false,
    isEmpty: false,
    emptyLabel: '',
    quickCreateLabel: undefined,
    quickCreateTo: undefined,
  },
);

// Computed
// Bundled into one object (rather than two separate booleans/strings) so
// the template never needs a non-null assertion to use the label/link
// after the `v-if` guard below.
const quickCreate = computed(() => {
  if (!props.quickCreateLabel || !props.quickCreateTo) {
    return null;
  }
  return { label: props.quickCreateLabel, to: props.quickCreateTo };
});
</script>

<template>
  <Card class="gap-0 overflow-hidden px-6 shadow-none">
    <CardHeader class="flex items-center justify-between gap-3 px-0! pb-4!">
      <div class="flex min-w-0 items-center gap-2.5">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-lg"
          :class="iconClass"
        >
          <component :is="icon" class="size-4 stroke-1.5" />
        </div>
        <CardTitle class="truncate">
          <NuxtLinkLocale
            :to="viewAllTo"
            :title="$t('home.overview.viewAll')"
            class="text-base hover:underline"
          >
            {{ title }}
          </NuxtLinkLocale>
        </CardTitle>
        <Badge variant="outline" class="text-xxs opacity-75">{{ total }}</Badge>
      </div>
      <NuxtLinkLocale
        :to="viewAllTo"
        :title="$t('home.overview.viewAll')"
        class="shrink-0 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Maximize2Icon class="size-3" />
      </NuxtLinkLocale>
    </CardHeader>

    <CardContent class="p-0">
      <div v-if="loading" class="divide-y divide-foreground/5">
        <div v-for="n in 3" :key="n" class="flex items-center gap-3 px-6 py-3">
          <Skeleton class="h-4 w-full" />
        </div>
      </div>
      <p v-else-if="isEmpty" class="px-6 py-4 text-sm text-muted-foreground">
        {{ emptyLabel }}
      </p>
      <slot v-else />
    </CardContent>

    <CardFooter v-if="quickCreate" class="border-t border-foreground/5 p-0!">
      <NuxtLinkLocale
        :to="quickCreate.to"
        class="flex w-full items-center gap-2 px-6 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <PlusIcon class="size-4" />
        {{ quickCreate.label }}
      </NuxtLinkLocale>
    </CardFooter>
  </Card>
</template>
