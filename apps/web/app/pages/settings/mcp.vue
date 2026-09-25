<script setup lang="ts">
import { CopyIcon } from '@lucide/vue';
import { toast } from 'vue-sonner';
import McpConnectedAppsList from '~/features/mcp/components/McpConnectedAppsList.vue';
import {
  isMcpDisabledError,
  useGetMcpConnections,
  useGetMcpSettings,
  useRevokeMcpConnection,
  useUpdateMcpSettings,
} from '~/features/mcp/composables/useMcpApi';
import { MCP_INTEGRATION_IDS } from '~/features/mcp/constants';
import type { McpAccessLevel, McpIntegrationId } from '~/features/mcp/types';

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { copy } = useClipboard();

useHead({ title: t('mcp.settings.title') });

const { data, error, isPending } = useGetMcpSettings();
const isDisabled = computed(() => isMcpDisabledError(error.value));

const { data: connectionsData } = useGetMcpConnections({
  enabled: () => data.value?.enabled === true,
});
const connections = computed(() => connectionsData.value?.connections ?? []);

const { mutateAsync: updateSettings, isPending: isSaving } =
  useUpdateMcpSettings();
const { mutateAsync: revokeConnection } = useRevokeMcpConnection();

// Functions
async function setEnabled(nextEnabled: boolean) {
  if (!data.value) return;
  if (!nextEnabled) {
    const confirmed = await confirm({
      title: t('mcp.settings.disableConfirm.title'),
      message: t('mcp.settings.disableConfirm.message'),
      confirmLabel: t('mcp.settings.disableConfirm.confirm'),
      cancelLabel: t('common.cancel'),
      variant: 'destructive',
    });
    if (!confirmed) return;
  }
  await updateSettings({ enabled: nextEnabled, access: data.value.access });
}

async function setAccess(integration: McpIntegrationId, level: McpAccessLevel) {
  if (!data.value) return;
  await updateSettings({
    enabled: data.value.enabled,
    access: { ...data.value.access, [integration]: level },
  });
}

function copyConnectorUrl() {
  if (!data.value) return;
  copy(data.value.connectorUrl);
  toast.success(t('mcp.settings.connectorUrl.copied'));
}

async function handleRevoke(connectionId: string) {
  const confirmed = await confirm({
    title: t('mcp.settings.connections.revokeConfirm.title'),
    message: t('mcp.settings.connections.revokeConfirm.message'),
    confirmLabel: t('mcp.settings.connections.revoke'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  await revokeConnection(connectionId);
  toast.success(t('mcp.settings.connections.revokeSuccess'));
}
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="t('mcp.settings.title')"
          :subtitle="t('mcp.settings.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>

    <div class="space-y-6 px-5 pb-10">
      <div v-if="isPending" class="space-y-4">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>

      <Card v-else-if="isDisabled" class="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{{ t('mcp.settings.notAvailable.title') }}</CardTitle>
        </CardHeader>
        <CardContent>
          <p class="text-sm text-muted-foreground">
            {{ t('mcp.settings.notAvailable.message') }}
          </p>
        </CardContent>
      </Card>

      <div v-else-if="error">
        <p class="text-sm text-stone-500">{{ t('mcp.settings.loadError') }}</p>
      </div>

      <template v-else-if="data">
        <Card class="mx-auto w-full max-w-2xl">
          <CardHeader>
            <CardTitle>{{ t('mcp.settings.masterToggle.title') }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex items-center gap-2">
              <Switch
                id="mcp-enabled"
                :model-value="data.enabled"
                :disabled="isSaving"
                @update:model-value="setEnabled"
              />
              <Label for="mcp-enabled" class="text-sm">
                {{ t('mcp.settings.masterToggle.label') }}
              </Label>
            </div>
          </CardContent>
        </Card>

        <Card v-if="data.enabled" class="mx-auto w-full max-w-2xl">
          <CardHeader>
            <CardTitle>{{ t('mcp.settings.connectorUrl.title') }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="flex items-center gap-2">
              <Input :model-value="data.connectorUrl" readonly class="h-9" />
              <Button variant="outline" size="icon" @click="copyConnectorUrl">
                <CopyIcon class="size-4 stroke-1.5" />
              </Button>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ t('mcp.settings.connectorUrl.howTo') }}
            </p>
          </CardContent>
        </Card>

        <Card class="mx-auto w-full max-w-2xl">
          <CardHeader>
            <CardTitle>{{ t('mcp.settings.access.title') }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <p class="text-sm text-muted-foreground">
              {{ t('mcp.settings.access.subtitle') }}
            </p>
            <div
              v-for="integration in MCP_INTEGRATION_IDS"
              :key="integration"
              class="flex items-center justify-between gap-4"
            >
              <span class="text-sm">{{
                t(`mcp.integrations.${integration}`)
              }}</span>
              <Select
                :model-value="data.access[integration] ?? 'off'"
                :disabled="isSaving"
                @update:model-value="
                  (level) =>
                    setAccess(integration, level as McpAccessLevel)
                "
              >
                <SelectTrigger class="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">{{
                    t('mcp.accessLevel.off')
                  }}</SelectItem>
                  <SelectItem value="read">{{
                    t('mcp.accessLevel.read')
                  }}</SelectItem>
                  <SelectItem value="write">{{
                    t('mcp.accessLevel.write')
                  }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card v-if="data.enabled" class="mx-auto w-full max-w-2xl">
          <CardHeader>
            <CardTitle>{{ t('mcp.settings.connections.title') }}</CardTitle>
          </CardHeader>
          <CardContent>
            <McpConnectedAppsList
              :connections="connections"
              @revoke="handleRevoke"
            />
          </CardContent>
        </Card>
      </template>
    </div>
  </SectionWrapper>
</template>
