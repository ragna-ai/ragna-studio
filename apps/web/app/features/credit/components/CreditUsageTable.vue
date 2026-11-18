<script setup lang="ts">
import type { CreditUsage } from '~/features/credit/types';

interface Props {
  usages: CreditUsage[];
}

// Props
defineProps<Props>();

// Composables
const { formatDateTime } = useDateTimeFormat();
const { t } = useI18n();

// Functions
function featureLabel(feature: CreditUsage['feature']): string {
  return t(`credit.usage.feature.${feature}`);
}
</script>

<template>
  <ListTable>
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead>{{ t('credit.usage.table.model') }}</TableHead>
        <TableHead class="w-28">{{
          t('credit.usage.table.provider')
        }}</TableHead>
        <TableHead class="w-32">{{
          t('credit.usage.table.feature')
        }}</TableHead>
        <TableHead class="w-24 text-right">
          {{ t('credit.usage.table.inputTokens') }}
        </TableHead>
        <TableHead class="w-24 text-right">
          {{ t('credit.usage.table.outputTokens') }}
        </TableHead>
        <TableHead class="w-24 text-right">
          {{ t('credit.usage.table.credits') }}
        </TableHead>
        <TableHead class="w-45">{{ t('credit.usage.table.date') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <ListEmptyRow v-if="usages.length === 0" :colspan="7">
        {{ t('credit.usage.empty') }}
      </ListEmptyRow>
      <TableRow v-for="usage in usages" :key="usage.id">
        <TableCell class="truncate font-medium">{{
          usage.modelDisplayName
        }}</TableCell>
        <TableCell>
          <Badge variant="secondary">{{ usage.provider }}</Badge>
        </TableCell>
        <TableCell class="truncate">
          {{ featureLabel(usage.feature) }}
        </TableCell>
        <TableCell class="text-right tabular-nums">
          {{ usage.inputTokens }}
        </TableCell>
        <TableCell class="text-right tabular-nums">
          {{ usage.outputTokens }}
        </TableCell>
        <TableCell class="text-right tabular-nums">
          {{ usage.credits }}
        </TableCell>
        <TableCell class="text-small text-muted-foreground">
          {{ formatDateTime(usage.createdAt) }}
        </TableCell>
      </TableRow>
    </TableBody>
  </ListTable>
</template>
