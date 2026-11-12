<script setup lang="ts">
import {
  DEFAULT_LIST_PAGE_SIZE,
  getPaginationPages,
} from '~/lib/pagination-pages';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '~/components/ui/pagination';

// Imports

/** `noun` is an i18n plural key, e.g. `agent.count`: "{count} agent | {count} agents". */
interface ListPaginationProps {
  totalCount: number;
  noun: string;
}

const PAGE_SIZE_OPTIONS = [10, DEFAULT_LIST_PAGE_SIZE, 50, 100];

// Props
const props = defineProps<ListPaginationProps>();

// Refs
const page = defineModel<number>('page', { default: 1 });
const limit = defineModel<number>('limit', { default: 25 });

// Composables
const { t } = useI18n();

// Computed
const totalPages = computed(() => Math.ceil(props.totalCount / limit.value));
const hasControls = computed(
  () => totalPages.value > 1 || limit.value > DEFAULT_LIST_PAGE_SIZE,
);
const countText = computed(() => {
  if (totalPages.value <= 1) {
    return t(props.noun, props.totalCount);
  }
  return t('pagination.range', {
    from: (page.value - 1) * limit.value + 1,
    to: Math.min(page.value * limit.value, props.totalCount),
    total: props.totalCount,
  });
});
const pageItems = computed(() =>
  getPaginationPages(page.value, totalPages.value),
);

// Hooks
watch(totalPages, (pageCount) => {
  if (pageCount >= 1 && page.value > pageCount) {
    page.value = pageCount;
  }
});

// Functions
function setLimit(value: unknown) {
  const newLimit = Number(value);
  if (!newLimit) {
    return;
  }
  limit.value = newLimit;
  page.value = 1;
}
</script>

<template>
  <div v-if="totalCount > 0" class="flex h-12 items-center justify-end gap-4">
    <span
      class="font-mono text-label font-medium text-muted-foreground uppercase"
    >
      {{ countText }}
    </span>
    <div v-if="hasControls" class="flex items-center gap-2">
      <Select :model-value="String(limit)" @update:model-value="setLimit">
        <SelectTrigger
          size="sm"
          class="w-34"
          :aria-label="t('pagination.itemsPerPage')"
        >
          <SelectValue>
            {{ t('pagination.perPage', { count: limit }) }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in PAGE_SIZE_OPTIONS"
            :key="option"
            :value="String(option)"
          >
            {{ option }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Pagination
        v-if="totalPages > 1"
        v-model:page="page"
        :total="totalCount"
        :items-per-page="limit"
        :aria-label="t('pagination.label')"
        class="mx-0 w-auto"
      >
        <PaginationContent>
          <PaginationPrevious :aria-label="t('pagination.previous')" />
          <template
            v-for="(item, index) in pageItems"
            :key="item === 'ellipsis' ? `ellipsis-${index}` : item"
          >
            <PaginationEllipsis v-if="item === 'ellipsis'" />
            <PaginationItem
              v-else
              :value="item"
              :is-active="item === page"
              :aria-label="t('pagination.goToPage', { page: item })"
              class="size-7 px-0"
            >
              {{ item }}
            </PaginationItem>
          </template>
          <PaginationNext :aria-label="t('pagination.next')" />
        </PaginationContent>
      </Pagination>
    </div>
  </div>
</template>
