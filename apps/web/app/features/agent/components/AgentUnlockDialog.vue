<script setup lang="ts">
import { useUnlockAgent } from '~/features/agent/composables/useAgentLockApi';
import { useGetAgentUsage } from '~/features/agent/composables/useAgentLockApi';

interface Props {
  agentId: string;
}

// Props
const props = defineProps<Props>();

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { mutate: unlockAgent, isPending } = useUnlockAgent();
const {
  data: usage,
  isPending: isUsageLoading,
  isError: isUsageError,
} = useGetAgentUsage(
  () => props.agentId,
  () => open.value,
);
const { t } = useI18n();

// Functions
function handleUnlock() {
  unlockAgent(props.agentId, { onSuccess: () => (open.value = false) });
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('agent.lock.unlockDialog.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('agent.lock.unlockDialog.description') }}
        </DialogDescription>
      </DialogHeader>
      <div class="text-sm" data-testid="agent-unlock-usage">
        <div v-if="isUsageLoading" class="flex justify-center py-2">
          <Spinner />
        </div>
        <p v-else-if="isUsageError" class="text-muted-foreground">
          {{ t('agent.lock.unlockDialog.usageFailed') }}
        </p>
        <ul v-else-if="usage" class="list-disc space-y-1 pl-5">
          <li>
            {{
              t(
                'agent.lock.unlockDialog.workflowCount',
                { count: usage.workflowCount },
                usage.workflowCount,
              )
            }}
          </li>
          <li>
            {{
              t(
                'agent.lock.unlockDialog.assignedTaskCount',
                { count: usage.assignedTaskCount },
                usage.assignedTaskCount,
              )
            }}
          </li>
        </ul>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">
          {{ t('common.cancel') }}
        </Button>
        <Button
          variant="destructive"
          :disabled="isPending"
          :loading="isPending"
          @click="handleUnlock"
        >
          {{ t('agent.lock.unlockDialog.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
