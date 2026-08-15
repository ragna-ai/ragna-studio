<script setup lang="ts">
import { AlertCircleIcon, RefreshCwIcon } from '@lucide/vue';
import { useDateTimeFormat } from '~/composables/useDateTimeFormat';
import type { EmailAccountSyncState } from '~/features/email/types';

const props = defineProps<{
  syncState: EmailAccountSyncState;
  lastSyncedAt: string | null;
}>();

const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

const label = computed(() => {
  if (props.syncState === 'syncing') return t('email.sync.syncing');
  if (props.syncState === 'error') return t('email.sync.error');
  return props.lastSyncedAt
    ? t('email.sync.lastSynced', { date: formatDateTime(props.lastSyncedAt) })
    : t('email.sync.neverSynced');
});
</script>

<template>
  <p
    class="flex items-center gap-1.5 text-xs text-muted-foreground"
    :class="{ 'text-destructive': props.syncState === 'error' }"
  >
    <RefreshCwIcon v-if="props.syncState === 'syncing'" class="size-3 animate-spin" />
    <AlertCircleIcon v-else-if="props.syncState === 'error'" class="size-3" />
    {{ label }}
  </p>
</template>
