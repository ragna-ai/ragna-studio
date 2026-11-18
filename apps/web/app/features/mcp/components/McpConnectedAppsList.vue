<script setup lang="ts">
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
  <ListTable>
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead>{{ t('mcp.settings.connections.table.client') }}</TableHead>
        <TableHead class="w-36">
          {{ t('mcp.settings.connections.table.lastUsed') }}
        </TableHead>
        <TableHead class="w-28">
          <span class="sr-only">{{ t('common.actions') }}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <ListEmptyRow v-if="connections.length === 0" :colspan="3">
        {{ t('mcp.settings.connections.empty') }}
      </ListEmptyRow>
      <TableRow
        v-for="connection in connections"
        :key="connection.id"
        class="h-14"
      >
        <TableCell>
          <ListTitleCell
            :title="displayName(connection)"
            :description="
              t('mcp.settings.connections.connectedIn', {
                workspace: connection.workspaceName,
                date: formatDateTime(connection.createdAt),
              })
            "
          />
        </TableCell>
        <TableCell class="truncate text-small text-muted-foreground">
          {{
            connection.lastUsedAt
              ? formatDateTime(connection.lastUsedAt)
              : t('mcp.settings.connections.neverUsed')
          }}
        </TableCell>
        <TableCell class="text-right">
          <Button
            leading-icon="hugeicons:unplug"
            variant="outline"
            size="sm"
            @click="emit('revoke', connection.id)"
          >
            {{ t('mcp.settings.connections.revoke') }}
          </Button>
        </TableCell>
      </TableRow>
    </TableBody>
  </ListTable>
</template>
