<script setup lang="ts">
import { ChevronLeftIcon, ChevronRightIcon } from '@lucide/vue';

// Imports

interface PaginationMeta {
  totalCount: number;
}

interface Props {
  meta: PaginationMeta;
  maxVisiblePages?: number;
}

// Props
const props = withDefaults(defineProps<Props>(), {
  maxVisiblePages: 7,
});

// Emits

// Refs
const page = defineModel<number>('page', { default: 1 });
const limit = defineModel<number>('limit', { default: 10 });

const MIN_PAGE_SIZE = 10;
const pageSizeOptions = [MIN_PAGE_SIZE, 25, 50, 100];

// Composables

// Computed
const totalPages = computed(() =>
  Math.ceil(props.meta.totalCount / limit.value),
);

// Keep showing the controls on a single page when a larger page size is
// active, so the user can switch back to a smaller one.
const showControls = computed(
  () => totalPages.value > 1 || limit.value > MIN_PAGE_SIZE,
);

// Page numbers to render; null marks an ellipsis gap.
const paginationRange = computed<(number | null)[]>(() => {
  const total = totalPages.value;
  const maxVisible = props.maxVisiblePages;

  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  // Pages around the current one; -3 reserves first, last, and current.
  const sidePages = Math.floor((maxVisible - 3) / 2);
  let rangeStart = Math.max(2, page.value - sidePages);
  let rangeEnd = Math.min(total - 1, page.value + sidePages);

  if (page.value <= sidePages + 2) {
    rangeStart = 2;
    rangeEnd = Math.min(total - 1, maxVisible - 1);
  } else if (page.value >= total - sidePages - 1) {
    rangeStart = Math.max(2, total - maxVisible + 2);
    rangeEnd = total - 1;
  }

  const pages: (number | null)[] = [1];
  if (rangeStart > 2) {
    pages.push(null);
  }
  for (let i = rangeStart; i <= rangeEnd; i++) {
    pages.push(i);
  }
  if (rangeEnd < total - 1) {
    pages.push(null);
  }
  pages.push(total);
  return pages;
});

// Functions
function goToPage(newPage: number) {
  page.value = Math.min(Math.max(newPage, 1), totalPages.value);
}

function setLimit(value: unknown) {
  const newLimit = Number(value);
  if (!newLimit) {
    return;
  }
  limit.value = newLimit;
  page.value = 1; // a new page size invalidates the current page position
}

// Hooks
</script>

<template>
  <div v-if="showControls" class="flex items-center justify-center gap-6">
    <nav
      v-if="totalPages > 1"
      class="flex items-center space-x-1"
      aria-label="Pagination"
    >
      <Button
        variant="ghost"
        size="icon"
        :disabled="page <= 1"
        aria-label="Previous page"
        @click="goToPage(page - 1)"
      >
        <ChevronLeftIcon class="size-4 stroke-1.5" />
      </Button>

      <template
        v-for="(pageNumber, index) in paginationRange"
        :key="pageNumber ?? `ellipsis-${index}`"
      >
        <span
          v-if="pageNumber === null"
          class="px-2 text-sm text-muted-foreground"
          >&hellip;</span
        >
        <Button
          v-else
          size="icon"
          :variant="pageNumber === page ? 'outline' : 'ghost'"
          :aria-label="`Go to page ${pageNumber}`"
          :aria-current="pageNumber === page ? 'page' : undefined"
          @click="goToPage(pageNumber)"
        >
          {{ pageNumber }}
        </Button>
      </template>

      <Button
        variant="ghost"
        size="icon"
        :disabled="page >= totalPages"
        aria-label="Next page"
        @click="goToPage(page + 1)"
      >
        <ChevronRightIcon class="size-4 stroke-1.5" />
      </Button>
    </nav>

    <!-- Items per page -->
    <div class="flex items-center gap-2">
      <Select :model-value="String(limit)" @update:model-value="setLimit">
        <SelectTrigger size="sm" aria-label="Items per page">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in pageSizeOptions"
            :key="option"
            :value="String(option)"
          >
            {{ option }}
          </SelectItem>
        </SelectContent>
      </Select>
      <span class="text-sm text-muted-foreground">per page</span>
    </div>
  </div>
</template>
