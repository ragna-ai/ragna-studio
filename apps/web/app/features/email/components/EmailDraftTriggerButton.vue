<script setup lang="ts">
import { SparklesIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import { useTriggerEmailDraft } from '~/features/email/composables/useEmailDraftApi';

// "Draft with AI": agent select preselects the
// account's default agent, overridable per use. Agents are workspace
// resources while the email account is per-user (PRD "Open questions"), so
// this lists agents from the user's active workspace, same source the
// workflow agent-node picker uses.
const props = defineProps<{
  threadId: string;
  replyToMessageId: string;
  defaultAgentId: string | null;
}>();

// Composables
const { t } = useI18n();
const { data: agentsData } = useGetAllAgents();
const { mutate: triggerDraft, isPending } = useTriggerEmailDraft();

// Refs
const open = ref(false);
const selectedAgentId = ref<string | null>(props.defaultAgentId);

// Computed
const agents = computed(() => agentsData.value?.agents ?? []);

watch(
  () => props.defaultAgentId,
  (value) => {
    if (!selectedAgentId.value) selectedAgentId.value = value;
  },
);

// Functions
function handleGenerate() {
  triggerDraft(
    {
      threadId: props.threadId,
      replyToMessageId: props.replyToMessageId,
      agentId: selectedAgentId.value ?? undefined,
    },
    { onSuccess: () => (open.value = false) },
  );
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm">
        <SparklesIcon class="mr-2 size-3.5" />
        {{ t('email.draft.trigger.button') }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-72 space-y-3" align="start">
      <p class="text-sm font-medium">{{ t('email.draft.trigger.title') }}</p>
      <Select v-model="selectedAgentId">
        <SelectTrigger class="w-full" size="sm">
          <SelectValue
            :placeholder="t('email.draft.trigger.agentPlaceholder')"
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="agent in agents" :key="agent.id" :value="agent.id">
            {{ agent.name }}
          </SelectItem>
        </SelectContent>
      </Select>
      <Button
        class="w-full"
        size="sm"
        :disabled="!selectedAgentId || isPending"
        @click="handleGenerate"
      >
        <Spinner v-if="isPending" class="mr-2" />
        {{ t('email.draft.trigger.generate') }}
      </Button>
    </PopoverContent>
  </Popover>
</template>
