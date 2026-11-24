<script setup lang="ts">
import type { AgentToolGrant } from '@repo/ai/client';
import { useApproveAgent } from '~/features/agent/composables/useAgentLockApi';

interface Props {
  agentId: string;
  toolGrants: AgentToolGrant[];
}

// Props
const props = defineProps<Props>();

// Refs
const open = defineModel<boolean>('open', { default: false });

// Composables
const { mutate: approveAgent, isPending } = useApproveAgent();
const { t } = useI18n();

// Computed
const toolLabels = computed(() =>
  props.toolGrants.map((grant) => {
    const label = t(`agent.tool.${grant.id}.label`);
    if (!('access' in grant)) return label;
    const access = t(
      grant.access === 'read'
        ? 'agent.lock.approveDialog.accessRead'
        : 'agent.lock.approveDialog.accessWrite',
    );
    return `${label} (${access})`;
  }),
);

// Functions
function handleApprove() {
  approveAgent(props.agentId, { onSuccess: () => (open.value = false) });
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ t('agent.lock.approveDialog.title') }}</DialogTitle>
        <DialogDescription>
          {{ t('agent.lock.approveDialog.description') }}
        </DialogDescription>
      </DialogHeader>
      <div class="space-y-3 text-sm">
        <p v-if="toolLabels.length > 0">
          <span class="font-medium">
            {{ t('agent.lock.approveDialog.canUse') }}
          </span>
          {{ toolLabels.join(', ') }}
        </p>
        <p v-else class="text-muted-foreground">
          {{ t('agent.lock.approveDialog.noTools') }}
        </p>
        <p class="text-muted-foreground">
          {{ t('agent.lock.approveDialog.knowledgeChanges') }}
        </p>
        <p class="font-medium">
          {{ t('agent.lock.approveDialog.responsibility') }}
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="open = false">
          {{ t('common.cancel') }}
        </Button>
        <Button
          :disabled="isPending"
          :loading="isPending"
          @click="handleApprove"
        >
          {{ t('agent.lock.approveDialog.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
