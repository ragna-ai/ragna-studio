<script setup lang="ts">
import type { TeamConfig } from '@repo/workflow';
import { CrownIcon } from '@lucide/vue';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import { getAgentSlotLabel } from '~/features/workflow/lib/agent-slot';
import { findFieldIssue } from '~/features/workflow/lib/validate-draft';
import { WORKFLOW_VALIDATION_KEY } from '~/features/workflow/types/validation';
import { cn } from '~/lib/utils';

// Imports

// Props
const props = defineProps<{
  nodeId: string;
  config: TeamConfig;
}>();

// Composables
const { data: agentsData } = useGetAllAgents();
// The run view provides no validation, so it shows the plain roster.
const validation = inject(WORKFLOW_VALIDATION_KEY, null);
const { t } = useI18n();

// Functions
function slotLabel(agentId: string) {
  return getAgentSlotLabel(agentId, agentsData.value, t);
}

function slotClass(field: string) {
  return cn(
    'truncate',
    findFieldIssue(validation?.value, props.nodeId, field) &&
      'text-destructive',
  );
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex flex-col gap-0.5">
      <span class="font-medium">{{ t('workflow.teamConfig.lead') }}</span>
      <span class="flex items-center gap-1 pl-1">
        <CrownIcon class="size-3 shrink-0 stroke-1.5" />
        <span :class="slotClass('leadAgentId')">{{
          slotLabel(config.leadAgentId)
        }}</span>
      </span>
    </div>

    <div class="flex flex-col gap-0.5">
      <span class="font-medium">{{ t('workflow.teamConfig.members') }}</span>
      <ul class="ml-1 flex flex-col gap-1 border-l pl-2">
        <li
          v-for="(member, index) in config.members"
          :key="index"
          class="flex flex-col"
        >
          <span :class="slotClass(`members.${index}.agentId`)">{{
            slotLabel(member.agentId)
          }}</span>
          <span v-if="member.role" class="truncate opacity-70">{{
            member.role
          }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
