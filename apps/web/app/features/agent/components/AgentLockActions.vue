<script setup lang="ts">
import type { AgentToolGrant } from '@repo/ai/client';
import AgentApprovalDialog from '~/features/agent/components/AgentApprovalDialog.vue';
import AgentUnlockDialog from '~/features/agent/components/AgentUnlockDialog.vue';
import AgentVersionSheet from '~/features/agent/components/AgentVersionSheet.vue';
import {
  useLockAgent,
  useRevokeAgentApproval,
} from '~/features/agent/composables/useAgentLockApi';
import type { AgentLockActions } from '~/features/agent/types';

interface Props {
  agentId: string;
  lockActions: AgentLockActions | undefined;
  toolGrants: AgentToolGrant[];
}

// Props
const props = defineProps<Props>();

// Refs
const approveOpen = ref(false);
const unlockOpen = ref(false);
const versionsOpen = ref(false);

// Composables
const { mutate: lockAgent, isPending: isLocking } = useLockAgent();
const { mutate: revokeApproval, isPending: isRevoking } =
  useRevokeAgentApproval();
const { t } = useI18n();
</script>

<template>
  <Button type="button" variant="outline" @click="versionsOpen = true">
    {{ t('agent.lock.actions.versions') }}
  </Button>
  <Button
    v-if="props.lockActions?.canLock"
    type="button"
    variant="outline"
    :disabled="isLocking"
    :loading="isLocking"
    @click="lockAgent(props.agentId)"
  >
    {{ t('agent.lock.actions.lock') }}
  </Button>
  <Button
    v-if="props.lockActions?.canApprove"
    type="button"
    variant="outline"
    @click="approveOpen = true"
  >
    {{ t('agent.lock.actions.approve') }}
  </Button>
  <Button
    v-if="props.lockActions?.canRevoke"
    type="button"
    variant="outline"
    :disabled="isRevoking"
    :loading="isRevoking"
    @click="revokeApproval(props.agentId)"
  >
    {{ t('agent.lock.actions.revoke') }}
  </Button>
  <Button
    v-if="props.lockActions?.canUnlock"
    type="button"
    variant="outline"
    @click="unlockOpen = true"
  >
    {{ t('agent.lock.actions.unlock') }}
  </Button>
  <AgentApprovalDialog
    v-model:open="approveOpen"
    :agent-id="props.agentId"
    :tool-grants="props.toolGrants"
  />
  <AgentUnlockDialog v-model:open="unlockOpen" :agent-id="props.agentId" />
  <AgentVersionSheet v-model:open="versionsOpen" :agent-id="props.agentId" />
</template>
