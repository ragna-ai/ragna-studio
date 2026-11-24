<script setup lang="ts">
import {
  agentLockStateIconName,
  useAgentLockSummary,
} from '~/features/agent/composables/useAgentLockSummary';
import type { AgentLock } from '~/features/agent/types';

interface Props {
  lock: AgentLock;
}

// Props
const props = defineProps<Props>();

// Composables
const { t } = useI18n();
const message = useAgentLockSummary(() => props.lock);
</script>

<template>
  <Alert data-testid="agent-lock-banner" class="mb-6 shrink-0">
    <Icon
      data-slot="alert-icon"
      :name="agentLockStateIconName(props.lock)"
      class="shrink-0"
    />
    <AlertTitle>{{ message }}</AlertTitle>
    <AlertDescription>
      {{
        t('agent.lock.banner.description', {
          version: props.lock.versionNumber,
        })
      }}
    </AlertDescription>
  </Alert>
</template>
