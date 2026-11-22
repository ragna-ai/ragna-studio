<script setup lang="ts">
import type { AgentLock } from '~/features/agent/types';

interface Props {
  lock: AgentLock;
}

// Props
const props = defineProps<Props>();

// Composables
const { t } = useI18n();

// Computed
const lockedByName = computed(
  () => props.lock.lockedBy?.name ?? t('agent.lock.unknownUser'),
);
const approverName = computed(
  () => props.lock.approval?.approvedBy?.name ?? t('agent.lock.unknownUser'),
);
const message = computed(() =>
  props.lock.approval
    ? t('agent.lock.banner.lockedAndApproved', {
        user: lockedByName.value,
        approver: approverName.value,
      })
    : t('agent.lock.banner.locked', { user: lockedByName.value }),
);
</script>

<template>
  <Alert data-testid="agent-lock-banner" class="mb-6 shrink-0">
    <Icon data-slot="alert-icon" name="hugeicons:square-lock-02" />
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
