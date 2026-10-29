<script setup lang="ts">
import { PROVIDER_ICON } from '~/features/integrations/lib/integration-meta';
import type { IntegrationConnectionDto } from '@repo/integrations/catalog';

// Props
interface Props {
  connection: IntegrationConnectionDto;
  isBusy?: boolean;
}

withDefaults(defineProps<Props>(), { isBusy: false });

// Emits
const emit = defineEmits<{
  (e: 'reconnect', connection: IntegrationConnectionDto): void;
  (e: 'remove', connection: IntegrationConnectionDto): void;
}>();

// Composables
const { t } = useI18n();
</script>

<template>
  <Card>
    <CardContent class="flex items-center justify-between gap-4 py-4">
      <div class="flex min-w-0 items-center gap-3">
        <Icon :name="PROVIDER_ICON[connection.provider]" class="size-6" />
        <div class="min-w-0 space-y-1">
          <p class="truncate text-sm font-medium">
            {{ t(`integrations.providers.${connection.provider}`) }}
            <span class="font-normal text-muted-foreground">
              {{ connection.externalEmail ?? connection.displayName }}
            </span>
          </p>
          <div class="flex flex-wrap items-center gap-1.5">
            <Badge
              v-for="integrationId in connection.integrations"
              :key="integrationId"
              variant="secondary"
            >
              {{ t(`integrations.names.${integrationId}`) }}
            </Badge>
            <Badge
              :variant="
                connection.status === 'active' ? 'outline' : 'destructive'
              "
            >
              {{ t(`integrations.status.${connection.status}`) }}
            </Badge>
          </div>
        </div>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button
          v-if="connection.status === 'needs_reauth'"
          size="sm"
          :disabled="isBusy"
          @click="emit('reconnect', connection)"
        >
          {{ t('integrations.actions.reconnect') }}
        </Button>
        <Button
          size="sm"
          variant="outline"
          :disabled="isBusy"
          @click="emit('remove', connection)"
        >
          {{ t('integrations.actions.remove') }}
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
