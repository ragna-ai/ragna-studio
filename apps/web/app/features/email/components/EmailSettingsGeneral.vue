<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import { useDisconnectEmailAccount, useUpdateEmailAccountSettings } from '~/features/email/composables/useEmailAccountApi';
import EmailSyncStatusBadge from '~/features/email/components/EmailSyncStatusBadge.vue';
import type { EmailAccount } from '~/features/email/types';

// Props
const props = defineProps<{ account: EmailAccount }>();

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { data: agentsData } = useGetAllAgents();
const { mutate: updateSettings } = useUpdateEmailAccountSettings();
const { mutate: disconnect, isPending: isDisconnecting } = useDisconnectEmailAccount();

// Computed
const agents = computed(() => agentsData.value?.agents ?? []);
const defaultAgentId = computed({
  get: () => props.account.defaultAgentId,
  set: (value) => updateSettings({ defaultAgentId: value }),
});

// Functions
async function handleDisconnect() {
  const confirmed = await confirm({
    title: t('email.settings.general.disconnectConfirmTitle'),
    message: t('email.settings.general.disconnectConfirmMessage'),
    confirmLabel: t('email.settings.general.disconnect'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  disconnect();
}
</script>

<template>
  <Card class="mx-auto w-full max-w-2xl">
    <CardHeader>
      <CardTitle>{{ t('email.settings.general.title') }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6">
      <div class="space-y-2">
        <p class="text-sm font-medium">{{ props.account.email }}</p>
        <EmailSyncStatusBadge :sync-state="props.account.syncState" :last-synced-at="props.account.lastSyncedAt" />
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">{{ t('email.settings.general.defaultAgent') }}</p>
        <p class="text-xs text-muted-foreground">{{ t('email.settings.general.defaultAgentHint') }}</p>
        <Select v-model="defaultAgentId">
          <SelectTrigger class="w-full max-w-sm">
            <SelectValue :placeholder="t('email.settings.general.defaultAgentPlaceholder')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="agent in agents" :key="agent.id" :value="agent.id">
              {{ agent.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="space-y-2 border-t pt-4">
        <p class="text-sm font-medium text-destructive">{{ t('email.settings.general.dangerZone') }}</p>
        <Button variant="outline" :disabled="isDisconnecting" @click="handleDisconnect">
          {{ t('email.settings.general.disconnect') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
