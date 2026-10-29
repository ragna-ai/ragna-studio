<script setup lang="ts">
import { toast } from 'vue-sonner';
import ConnectionCard from '~/features/integrations/components/ConnectionCard.vue';
import {
  useGetIntegrationCatalog,
  useGetIntegrationConnections,
  useRemoveIntegrationConnection,
  useStartIntegrationConnect,
} from '~/features/integrations/composables/useIntegrationApi';
import { useIntegrationErrorToast } from '~/features/integrations/composables/useIntegrationErrorToast';
import {
  CONNECTIONS_PAGE_PATH,
  connectionUsesMailbox,
  PROVIDER_ICON,
  reconnectIntegrationId,
} from '~/features/integrations/lib/integration-meta';
import type {
  CatalogEntry,
  IntegrationConnectionDto,
} from '@repo/integrations/catalog';

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();

useHead({ title: t('integrations.page.title') });
useIntegrationErrorToast();

const { data: connectionsData, isPending: isLoadingConnections } =
  useGetIntegrationConnections();
const { data: catalogData } = useGetIntegrationCatalog();
const { mutate: startConnect, isPending: isStarting } =
  useStartIntegrationConnect();
const { mutateAsync: removeConnection, isPending: isRemoving } =
  useRemoveIntegrationConnection();

// Computed
const connections = computed(() => connectionsData.value?.connections ?? []);
const availableIntegrations = computed(() => {
  const connectedIds = new Set(
    connections.value.flatMap((connection) => connection.integrations),
  );
  return (catalogData.value?.integrations ?? []).filter(
    (integration) => !connectedIds.has(integration.id),
  );
});
const isBusy = computed(() => isStarting.value || isRemoving.value);

// Functions
function connect(integration: CatalogEntry) {
  startConnect({
    integrationId: integration.id,
    returnPath: CONNECTIONS_PAGE_PATH,
  });
}

function reconnect(connection: IntegrationConnectionDto) {
  startConnect({
    integrationId: reconnectIntegrationId(connection),
    returnPath: CONNECTIONS_PAGE_PATH,
  });
}

function removalMessage(connection: IntegrationConnectionDto): string {
  const parts = [t('integrations.remove.message')];
  if (connectionUsesMailbox(connection)) {
    parts.push(t('integrations.remove.mailboxWarning'));
  }
  parts.push(t(`integrations.remove.hint.${connection.provider}`));
  parts.push(t('integrations.remove.scopesNote'));
  return parts.join(' ');
}

async function handleRemove(connection: IntegrationConnectionDto) {
  const confirmed = await confirm({
    title: t('integrations.remove.title'),
    message: removalMessage(connection),
    confirmLabel: t('integrations.actions.remove'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  await removeConnection(connection.id);
}
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="t('integrations.page.title')"
          :subtitle="t('integrations.page.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>

    <div class="mx-auto w-full max-w-2xl space-y-6 px-5 pb-10">
      <div v-if="isLoadingConnections" class="space-y-3">
        <Skeleton class="h-20 w-full" />
        <Skeleton class="h-20 w-full" />
      </div>

      <template v-else>
        <p
          v-if="connections.length === 0"
          class="text-sm text-muted-foreground"
        >
          {{ t('integrations.page.empty') }}
        </p>
        <div v-else class="space-y-3">
          <ConnectionCard
            v-for="connection in connections"
            :key="connection.id"
            :connection="connection"
            :is-busy="isBusy"
            @reconnect="reconnect"
            @remove="handleRemove"
          />
        </div>

        <Card v-if="availableIntegrations.length > 0">
          <CardHeader>
            <CardTitle>{{ t('integrations.page.available') }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <div
              v-for="integration in availableIntegrations"
              :key="integration.id"
              class="flex items-center justify-between gap-4"
            >
              <div class="flex items-center gap-3">
                <Icon
                  :name="PROVIDER_ICON[integration.provider]"
                  class="size-5"
                />
                <span class="text-sm">{{
                  t(`integrations.names.${integration.id}`)
                }}</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                :disabled="isBusy"
                @click="connect(integration)"
              >
                {{ t('integrations.actions.connect') }}
              </Button>
            </div>
          </CardContent>
        </Card>
      </template>
    </div>
  </SectionWrapper>
</template>
