<script setup lang="ts">
import { UnplugIcon } from '@lucide/vue';
import { clientHost } from '~/features/mcp/lib/oauth-client';
import type { McpConnection } from '~/features/mcp/types';

// Imports

// Props
interface Props {
  connections: McpConnection[];
}

defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'revoke', connectionId: string): void;
}>();

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Functions
function displayName(connection: McpConnection): string {
  return connection.clientName ?? clientHost(connection.clientId);
}
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>{{ t('mcp.settings.connections.table.client') }}</TableHead>
        <TableHead>{{
          t('mcp.settings.connections.table.workspace')
        }}</TableHead>
        <TableHead>{{
          t('mcp.settings.connections.table.connected')
        }}</TableHead>
        <TableHead>{{
          t('mcp.settings.connections.table.lastUsed')
        }}</TableHead>
        <TableHead class="text-right">{{ t('common.actions') }}</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="connections.length === 0" :colspan="5">
        {{ t('mcp.settings.connections.empty') }}
      </TableEmpty>
      <TableRow v-for="connection in connections" :key="connection.id">
        <TableCell class="text-sm font-medium">
          {{ displayName(connection) }}
        </TableCell>
        <TableCell class="text-sm">{{ connection.workspaceName }}</TableCell>
        <TableCell class="text-sm whitespace-nowrap">
          {{ formatDateTime(connection.createdAt) }}
        </TableCell>
        <TableCell class="text-sm whitespace-nowrap">
          {{
            connection.lastUsedAt
              ? formatDateTime(connection.lastUsedAt)
              : t('mcp.settings.connections.neverUsed')
          }}
        </TableCell>
        <TableCell class="text-right">
          <Button
            variant="outline"
            size="sm"
            @click="emit('revoke', connection.id)"
          >
            <UnplugIcon class="size-4 stroke-1.5" />
            {{ t('mcp.settings.connections.revoke') }}
          </Button>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
