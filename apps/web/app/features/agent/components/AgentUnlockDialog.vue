<script setup lang="ts">
import { agentLockStateIconName } from '~/features/agent/composables/useAgentLockSummary';
import type { AgentLock } from '~/features/agent/types';
import {
  useUnlockAgent,
  useUnlockAgentStoppingRuns,
} from '~/features/agent/composables/useAgentLockApi';
import { getProblemType } from '~/lib/api-error';
import { useGetAgentUsage } from '~/features/agent/composables/useAgentLockApi';

interface Props {
  agentId: string;
  lock: AgentLock | null | undefined;
}

// Props
const props = defineProps<Props>();

// Refs
const open = defineModel<boolean>('open', { default: false });

const hasActiveTaskRuns = ref(false);

// Composables
const { mutate: unlockAgent, isPending: isUnlocking } = useUnlockAgent();
const { mutate: unlockAgentStoppingRuns, isPending: isStoppingRuns } =
  useUnlockAgentStoppingRuns();
const isPending = computed(() => isUnlocking.value || isStoppingRuns.value);
const {
  data: usage,
  isPending: isUsageLoading,
  isError: isUsageError,
} = useGetAgentUsage(
  () => props.agentId,
  () => open.value,
);
const { t } = useI18n();

// Computed
const confirmLabel = computed(() => {
  if (hasActiveTaskRuns.value) {
    return t('agent.lock.unlockDialog.stopRunsAndUnlock');
  }
  return props.lock?.approval
    ? t('agent.lock.unlockDialog.confirmApproved')
    : t('agent.lock.unlockDialog.confirm');
});

// Functions
interface UsageStatusIcon {
  name: `hugeicons:${string}`;
  class: string;
}

/** A check when nothing uses the agent, a warning when something does. */
function usageStatusIcon(count: number): UsageStatusIcon {
  return count === 0
    ? { name: 'hugeicons:checkmark-circle-02', class: 'text-status-ok-fg' }
    : { name: 'hugeicons:alert-circle', class: 'text-status-warn-fg' };
}

watch(open, (isOpen) => {
  if (isOpen) {
    hasActiveTaskRuns.value = false;
  }
});

function handleUnlock() {
  const mutate = hasActiveTaskRuns.value
    ? unlockAgentStoppingRuns
    : unlockAgent;
  mutate(props.agentId, {
    onSuccess: () => (open.value = false),
    onError: (error) => {
      if (getProblemType(error) === 'agent-has-active-task-runs') {
        hasActiveTaskRuns.value = true;
      }
    },
  });
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
      <Alert v-if="props.lock?.approval" variant="warning">
        <Icon
          data-slot="alert-icon"
          :name="agentLockStateIconName(props.lock)"
          class="shrink-0"
        />
        <AlertTitle>{{
          t('agent.lock.unlockDialog.approvedTitle')
        }}</AlertTitle>
        <AlertDescription>
          {{ t('agent.lock.unlockDialog.approvedText') }}
        </AlertDescription>
      </Alert>
      <Alert v-if="hasActiveTaskRuns" variant="warning">
        <Icon data-slot="alert-icon" name="hugeicons:alert-circle" />
        <AlertTitle>{{
          t('agent.lock.unlockDialog.activeRunsTitle')
        }}</AlertTitle>
        <AlertDescription>
          {{ t('agent.lock.unlockDialog.activeRunsText') }}
        </AlertDescription>
      </Alert>
      <div class="text-sm" data-testid="agent-unlock-usage">
        <div v-if="isUsageLoading" class="flex justify-center py-2">
          <Spinner />
        </div>
        <p v-else-if="isUsageError" class="text-muted-foreground">
          {{ t('agent.lock.unlockDialog.usageFailed') }}
        </p>
        <ul v-else-if="usage" class="space-y-1">
          <li class="flex items-center gap-2">
            <Icon
              :name="usageStatusIcon(usage.workflowCount).name"
              :class="[
                'size-4 shrink-0',
                usageStatusIcon(usage.workflowCount).class,
              ]"
            />
            {{
              t(
                'agent.lock.unlockDialog.workflowCount',
                { count: usage.workflowCount },
                usage.workflowCount,
              )
            }}
          </li>
          <li class="flex items-center gap-2">
            <Icon
              :name="usageStatusIcon(usage.assignedTaskCount).name"
              :class="[
                'size-4 shrink-0',
                usageStatusIcon(usage.assignedTaskCount).class,
              ]"
            />
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
          {{ confirmLabel }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
