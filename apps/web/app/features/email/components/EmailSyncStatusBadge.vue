<script setup lang="ts">
import { AlertCircleIcon, AlertTriangleIcon, RefreshCwIcon } from '@lucide/vue';
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
  if (props.syncState === 'reauth_required') return t('email.sync.reauthRequired');
  return props.lastSyncedAt
    ? t('email.sync.lastSynced', { date: formatDateTime(props.lastSyncedAt) })
    : t('email.sync.neverSynced');
});
</script>

<template>
  <p
    class="flex items-center gap-1.5 text-xs text-muted-foreground"
    :class="{
      'text-destructive': props.syncState === 'error' || props.syncState === 'reauth_required',
    }"
  >
    <RefreshCwIcon v-if="props.syncState === 'syncing'" class="size-3 animate-spin" />
    <AlertTriangleIcon v-else-if="props.syncState === 'reauth_required'" class="size-3" />
    <AlertCircleIcon v-else-if="props.syncState === 'error'" class="size-3" />
    {{ label }}
  </p>
</template>
