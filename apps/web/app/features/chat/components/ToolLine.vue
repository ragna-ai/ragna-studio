<script setup lang="ts">
import { CollapsibleTrigger } from '~/components/ui/collapsible';
import { Spinner } from '~/components/ui/spinner';
import type { ToolLineStatus } from '~/features/chat/lib/tool-status';

interface ToolLineProps {
  status: ToolLineStatus;
  label: string;
}

defineProps<ToolLineProps>();

const TEXT_CLASS: Record<ToolLineStatus, string> = {
  running: 'text-agent-text',
  done: 'text-muted-foreground',
  failed: 'text-foreground',
};
</script>

<template>
  <CollapsibleTrigger
    class="group/line flex h-6 items-center gap-1.5 rounded-sm text-left text-small focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden"
    :class="TEXT_CLASS[status]"
  >
    <span class="flex size-4 shrink-0 items-center justify-center">
      <Spinner v-if="status === 'running'" class="size-3.5 text-agent" />
      <Icon
        v-else-if="status === 'failed'"
        name="hugeicons:alert-circle"
        class="size-3.5 text-status-danger"
      />
      <Icon
        v-else
        name="hugeicons:checkmark-circle-02"
        class="size-4 text-status-ok"
      />
    </span>
    <span class="truncate">{{ label }}</span>
    <Icon
      name="hugeicons:arrow-right-01"
      class="size-3.5 shrink-0 text-icon transition-transform group-data-[state=open]/line:rotate-90"
    />
  </CollapsibleTrigger>
</template>
