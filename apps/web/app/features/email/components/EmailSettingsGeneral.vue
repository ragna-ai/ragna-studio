<script setup lang="ts">
import { AlertTriangleIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import EmailSyncStatusBadge from '~/features/email/components/EmailSyncStatusBadge.vue';
import {
  useDisconnectEmailAccount,
  useUpdateEmailAccountSettings,
} from '~/features/email/composables/useEmailAccountApi';
import { useEmailConnectFlow } from '~/features/email/composables/useEmailConnectFlow';
import type { EmailAccount } from '~/features/email/types';

// Props
const props = defineProps<{ account: EmailAccount }>();

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { data: agentsData } = useGetAllAgents();
const { mutate: updateSettings } = useUpdateEmailAccountSettings();
const { mutate: disconnect, isPending: isDisconnecting } =
  useDisconnectEmailAccount();
const { startReconnect, isRelinking } = useEmailConnectFlow();

// Computed
const agents = computed(() => agentsData.value?.agents ?? []);
const defaultAgentId = computed({
  get: () => props.account.defaultAgentId,
  set: (value) => updateSettings({ defaultAgentId: value }),
});
const needsReconnect = computed(
  () => props.account.syncState === 'reauth_required',
);
const providerIcon = computed(() =>
  props.account.provider === 'microsoft' ? 'logos:microsoft-icon' : 'logos:google-icon',
);
const providerLabel = computed(() =>
  t(`email.settings.general.provider.${props.account.provider}`),
);

// Functions
async function handleDisconnect() {
  const confirmed = await confirm({
    title: t('email.settings.general.disconnectConfirmTitle'),
    message: t('email.settings.general.disconnectConfirmMessage', { provider: providerLabel.value }),
    confirmLabel: t('email.settings.general.disconnect'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  disconnect();
}

// EmailClient.vue is the one place that finishes the reconnect on return (MAIL_RECONNECT_CALLBACK_PARAM).
function handleReconnect() {
  startReconnect(props.account.provider, '/mail');
}
</script>

<template>
  <Card class="mx-auto w-full max-w-2xl">
    <CardHeader>
      <CardTitle>{{ t('email.settings.general.title') }}</CardTitle>
    </CardHeader>
    <CardContent class="space-y-6">
      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <Icon :name="providerIcon" class="size-4 shrink-0" />
          <p class="text-sm font-medium">{{ props.account.email }}</p>
          <span class="text-xs text-muted-foreground">{{ providerLabel }}</span>
        </div>
        <EmailSyncStatusBadge
          :sync-state="props.account.syncState"
          :last-synced-at="props.account.lastSyncedAt"
        />
        <div v-if="needsReconnect" class="space-y-2 pt-1">
          <p
            class="flex max-w-lg items-center gap-1.5 text-xs text-destructive"
          >
            <AlertTriangleIcon class="size-3.5 shrink-0" />
            {{ t('email.settings.general.reconnectHint', { provider: providerLabel }) }}
          </p>
          <Button
            variant="default"
            :disabled="isRelinking"
            @click="handleReconnect"
          >
            <Spinner v-if="isRelinking" class="mr-2" />
            {{ t('email.settings.general.reconnect', { provider: providerLabel }) }}
          </Button>
        </div>
      </div>

      <div class="space-y-2">
        <p class="text-sm font-medium">
          {{ t('email.settings.general.defaultAgent') }}
        </p>
        <p class="text-xs text-muted-foreground">
          {{ t('email.settings.general.defaultAgentHint') }}
        </p>
        <Select v-model="defaultAgentId">
          <SelectTrigger class="w-full max-w-sm">
            <SelectValue
              :placeholder="t('email.settings.general.defaultAgentPlaceholder')"
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="agent in agents"
              :key="agent.id"
              :value="agent.id"
            >
              {{ agent.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="space-y-2 border-t pt-4">
        <p class="text-sm font-medium text-destructive">
          {{ t('email.settings.general.dangerZone') }}
        </p>
        <Button
          variant="outline"
          :disabled="isDisconnecting"
          @click="handleDisconnect"
        >
          {{ t('email.settings.general.disconnect') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
