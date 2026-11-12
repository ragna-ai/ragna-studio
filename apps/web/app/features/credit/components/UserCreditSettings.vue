<script setup lang="ts">
import { DEFAULT_LIST_PAGE_SIZE } from '~/lib/pagination-pages';
import CreditUsageTable from '~/features/credit/components/CreditUsageTable.vue';
import { useGetCreditUsage } from '~/features/credit/composables/useCreditApi';

// Imports

// Props
// Emits

// Refs
const page = ref(1);
const limit = ref(DEFAULT_LIST_PAGE_SIZE);

// Composables
const { data, error } = useGetCreditUsage(page, limit);
const { t } = useI18n();

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });

// Functions

// Hooks
</script>

<template>
  <div class="mx-auto w-full max-w-4xl">
    <div v-if="data">
      <CreditUsageTable :usages="data.usages" />
      <div class="pt-6 pb-10">
        <ListPagination
          v-model:page="page"
          v-model:limit="limit"
          :total-count="meta.totalCount"
          noun="credit.usage.count"
        />
      </div>
    </div>
    <p v-else-if="error" class="text-sm text-destructive">
      {{ t('credit.usage.loadError') }}
    </p>
  </div>
</template>
