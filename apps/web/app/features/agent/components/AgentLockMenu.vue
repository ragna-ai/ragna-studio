<script setup lang="ts">
import type { AgentToolGrant } from '@repo/ai/client';
import { Button } from '~/components/ui/button';
import AgentApprovalDialog from '~/features/agent/components/AgentApprovalDialog.vue';
import AgentUnlockDialog from '~/features/agent/components/AgentUnlockDialog.vue';
import {
  useLockAgent,
  useRevokeAgentApproval,
} from '~/features/agent/composables/useAgentLockApi';
import {
  agentLockStateIconName,
  useAgentLockSummary,
} from '~/features/agent/composables/useAgentLockSummary';
import type { AgentLock, AgentLockActions } from '~/features/agent/types';

interface Props {
  agentId: string;
  lock: AgentLock | null | undefined;
  lockActions: AgentLockActions | undefined;
  toolGrants: AgentToolGrant[];
}

// Props
const props = defineProps<Props>();

// Refs
const approveOpen = ref(false);
const unlockOpen = ref(false);

// Composables
const { mutate: lockAgent, isPending: isLocking } = useLockAgent();
const { mutate: revokeApproval, isPending: isRevoking } =
  useRevokeAgentApproval();
const { t } = useI18n();
const lockSummary = useAgentLockSummary(() => props.lock);

// Computed
const isLocked = computed(() => !!props.lock);
const stateLabel = computed(() =>
  isLocked.value
    ? t('agent.lock.state.ariaLocked')
    : t('agent.lock.state.ariaUnlocked'),
);
const buttonIconName = computed(() =>
  props.lock
    ? agentLockStateIconName(props.lock)
    : 'hugeicons:square-unlock-02',
);
const tooltipText = computed(() =>
  isLocked.value ? lockSummary.value : t('agent.lock.state.unlocked'),
);
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <Tooltip>
      <TooltipTrigger as-child>
        <span>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="icon"
                class="text-icon"
                :aria-label="stateLabel"
              >
                <Icon :name="buttonIconName" class="size-4 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                v-if="props.lockActions?.canLock"
                :disabled="isLocking"
                @click="lockAgent(props.agentId)"
              >
                <Icon name="hugeicons:square-lock-02" class="shrink-0" />
                {{ t('agent.lock.actions.lock') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="props.lockActions?.canApprove"
                @click="approveOpen = true"
              >
                <Icon name="hugeicons:ai-cloud" class="shrink-0" />
                {{ t('agent.lock.actions.approve') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="props.lockActions?.canRevoke"
                :disabled="isRevoking"
                @click="revokeApproval(props.agentId)"
              >
                <Icon name="hugeicons:cloud-off" class="shrink-0" />
                {{ t('agent.lock.actions.revoke') }}
              </DropdownMenuItem>
              <DropdownMenuItem
                v-if="props.lockActions?.canUnlock"
                @click="unlockOpen = true"
              >
                <Icon name="hugeicons:square-unlock-02" class="shrink-0" />
                {{ t('agent.lock.actions.unlock') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
      </TooltipTrigger>
      <TooltipContent>{{ tooltipText }}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
  <AgentApprovalDialog
    v-model:open="approveOpen"
    :agent-id="props.agentId"
    :tool-grants="props.toolGrants"
  />
  <AgentUnlockDialog
    v-model:open="unlockOpen"
    :agent-id="props.agentId"
    :lock="props.lock"
  />
</template>
