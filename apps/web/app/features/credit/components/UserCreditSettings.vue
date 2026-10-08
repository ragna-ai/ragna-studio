<script setup lang="ts">
import CreditUsageTable from '~/features/credit/components/CreditUsageTable.vue';
import { useGetCreditUsage } from '~/features/credit/composables/useCreditApi';

// Imports

// Props
// Emits

// Refs
const page = ref(1);
const limit = ref(10);

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
      <CreditUsageTable :usages="data.usages" :meta="meta" />
      <div class="pt-6 pb-10">
        <PaginateControls
          v-model:page="page"
          v-model:limit="limit"
          :meta="meta"
        />
      </div>
    </div>
    <p v-else-if="error" class="text-sm text-destructive">
      {{ t('credit.usage.loadError') }}
    </p>
  </div>
</template>
