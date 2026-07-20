<script setup lang="ts">
import type { WorkflowNode } from '@repo/workflow';
import { SettingsIcon } from '@lucide/vue';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import WorkflowTemplateHint from '~/features/workflow/components/WorkflowTemplateHint.vue';
import { NODE_TYPE_LABEL_KEYS } from '~/features/workflow/types/node-data';
import { firstToUpperCase } from '~/lib/utils';

// Imports

const NO_AGENT = '__none__';

// Props
// The panel only renders this form when node.type === 'agent', so the
// narrowed node (and therefore its config) is guaranteed to be AgentConfig.
const props = defineProps<{
  node: Extract<WorkflowNode, { type: 'agent' }>;
}>();

// Composables
const { data: agentsData, isLoading: isLoadingAgents } = useGetAllAgents();
const { t } = useI18n();

// Computed
const agentOptions = computed(() => agentsData.value?.agents ?? []);

const selectedAgentId = computed({
  get: () => props.node.data.config.agentId ?? NO_AGENT,
  set: (value: string) => {
    props.node.data.config.agentId = value === NO_AGENT ? undefined : value;
  },
});

// The full config summary below is a read-only window into the selected
// agent's chat config (model, tools); it is edited on the agent's own page.
const selectedAgent = computed(() =>
  agentOptions.value.find((agent) => agent.id === props.node.data.config.agentId),
);
</script>

<template>
  <div class="space-y-4">
    <div>
      <Label class="mb-2 block text-sm font-medium">{{ t(NODE_TYPE_LABEL_KEYS.agent) }}</Label>
      <Select v-model="selectedAgentId">
        <SelectTrigger class="w-full">
          <SelectValue :placeholder="t('workflow.agentPicker.placeholder')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="NO_AGENT">{{ t('workflow.agentConfig.noneUseSystemPrompt') }}</SelectItem>
          <SelectItem v-for="agent in agentOptions" :key="agent.id" :value="agent.id">
            {{ agent.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p v-if="isLoadingAgents" class="mt-1 text-xs text-muted-foreground">
        {{ t('workflow.agentPicker.loading') }}
      </p>
    </div>

    <div v-if="selectedAgent" class="space-y-2 rounded-md border bg-muted/40 p-3">
      <div class="flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-muted-foreground">{{ t('workflow.agentConfig.agentConfiguration') }}</span>
        <Button as-child variant="ghost" size="icon" class="size-6" :aria-label="t('workflow.agentConfig.editAgentSettings')">
          <NuxtLinkLocale :to="`/agent/${selectedAgent.id}`">
            <SettingsIcon class="size-3.5 stroke-1.5" />
          </NuxtLinkLocale>
        </Button>
      </div>
      <div class="flex items-center gap-2 text-xs">
        <span class="text-muted-foreground">{{ t('common.model') }}</span>
        <span v-if="selectedAgent.aiModel">
          {{ firstToUpperCase(selectedAgent.aiModel.provider) }} - {{ selectedAgent.aiModel.displayName }}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-xs text-muted-foreground">{{ t('workflow.agentConfig.tools') }}</span>
        <Badge v-for="tool in selectedAgent.tools" :key="tool" variant="secondary">
          {{ tool }}
        </Badge>
        <span v-if="!selectedAgent.tools?.length" class="text-xs text-muted-foreground">
          {{ t('common.noTools') }}
        </span>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ t('workflow.agentConfig.note') }}
      </p>
    </div>

    <div v-if="!node.data.config.agentId">
      <Label class="mb-2 block text-sm font-medium">{{ t('workflow.agentConfig.systemPromptLabel') }}</Label>
      <Textarea
        v-model="node.data.config.systemPrompt"
        rows="4"
        :placeholder="t('workflow.agentConfig.systemPromptPlaceholder')"
      />
    </div>

    <div>
      <Label class="mb-2 block text-sm font-medium">{{ t('common.prompt') }}</Label>
      <Textarea v-model="node.data.config.prompt" rows="6" />
      <WorkflowTemplateHint class="mt-1" />
    </div>
  </div>
</template>
