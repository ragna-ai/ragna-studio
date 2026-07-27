<script setup lang="ts">
import type { CreditUsage } from '~/features/credit/types';

// Imports

interface Props {
  usages: CreditUsage[];
  meta?: { totalCount: number };
}

// Props
defineProps<Props>();

// Emits

// Refs

// Composables
const { formatDateTime } = useDateTimeFormat();
const { t } = useI18n();

// Computed

// Functions
function featureLabel(feature: CreditUsage['feature']): string {
  return t(`credit.usage.feature.${feature}`);
}

// Hooks
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ t('credit.usage.table.model') }}</TableHead>
        <TableHead>{{ t('credit.usage.table.provider') }}</TableHead>
        <TableHead>{{ t('credit.usage.table.feature') }}</TableHead>
        <TableHead class="text-right">
          {{ t('credit.usage.table.inputTokens') }}
        </TableHead>
        <TableHead class="text-right">
          {{ t('credit.usage.table.outputTokens') }}
        </TableHead>
        <TableHead class="text-right">
          {{ t('credit.usage.table.credits') }}
        </TableHead>
        <TableHead>{{ t('credit.usage.table.date') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="usages.length === 0" :colspan="7">
        {{ t('credit.usage.empty') }}
      </TableEmpty>
      <TableRow v-for="usage in usages" :key="usage.id">
        <TableCell class="font-medium">{{ usage.modelDisplayName }}</TableCell>
        <TableCell class="whitespace-nowrap">
          <Badge variant="secondary">{{ usage.provider }}</Badge>
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ featureLabel(usage.feature) }}
        </TableCell>
        <TableCell class="text-right whitespace-nowrap">
          {{ usage.inputTokens }}
        </TableCell>
        <TableCell class="text-right whitespace-nowrap">
          {{ usage.outputTokens }}
        </TableCell>
        <TableCell class="text-right whitespace-nowrap">
          {{ usage.credits }}
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ formatDateTime(usage.createdAt) }}
        </TableCell>
      </TableRow>
    </TableBody>
    <!-- Meta Caption -->
    <TableMetaCaption :itemsLength="usages.length" :meta="meta" />
  </Table>
</template>
