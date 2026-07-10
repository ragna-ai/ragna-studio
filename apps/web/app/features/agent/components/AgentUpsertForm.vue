<script setup lang="ts">
import {
  BookIcon,
  BriefcaseBusinessIcon,
  CircleUserRoundIcon,
  SettingsIcon,
  StarsIcon,
} from '@lucide/vue';
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import useAgentApi from '~/features/agent/composables/useAgentApi';

type UpsertAgentProps = {
  id?: string;
  userId?: string;
  aiModelId?: string;
  name?: string;
  systemPrompt?: string;
  description?: string;
  tools?: string[];
  isDefault?: boolean;
};

const agentUpsertSchema = z.object({
  id: z.uuidv7().optional(),
  userId: z.uuidv7().optional(),
  aiModelId: z.uuidv7(),
  name: z.string().min(4, {
    message: 'Name must be at least 4 characters.',
  }),
  systemPrompt: z.string(),
  description: z.string().optional(),
  tools: z.array(z.string()).optional(),
  isDefault: z.boolean().optional(),
});

// Props
const props = defineProps<UpsertAgentProps>();
// Emits

// Refs
const currentTab = ref('title');

// Composables
const { upsertAgent } = useAgentApi();
const { isPending, mutate } = upsertAgent();

const form = useForm({
  defaultValues: {
    id: props.id,
    userId: props.userId,
    aiModelId: props.aiModelId ?? '',
    name: props.name ?? '',
    systemPrompt: props.systemPrompt ?? '',
    description: props.description,
    tools: props.tools,
    isDefault: props.isDefault,
  },
  validators: {
    onChange: agentUpsertSchema,
  },
  onSubmit: ({ value }) => mutate(value),
});

// Computed
const tabsWithErrors = computed<string[]>(() => {
  const errors = form.state.errors.value;
  return Object.keys(errors);
});
// Functions

// Hooks

const siderBarTabs = [
  { id: 'title', icon: SettingsIcon, label: 'Settings' },
  {
    id: 'systemPrompt',
    icon: CircleUserRoundIcon,
    label: 'System Prompt',
  },
  { id: 'llmId', icon: StarsIcon, label: 'GenAI' },
  {
    id: 'tools',
    icon: BriefcaseBusinessIcon,
    label: 'Tools',
  },
  { id: 'knowledge', icon: BookIcon, label: 'Knowledge' },
  {
    id: 'tools',
    icon: BriefcaseBusinessIcon,
    label: 'Tools',
  },
];
</script>

<template>
  <form @submit.prevent.stop="form.handleSubmit">
    <TabSidebar
      v-model="currentTab"
      :tabs="siderBarTabs"
      :error-tabs="tabsWithErrors"
    >
      <!-- TAB 1-->
      <template #title> some </template>
    </TabSidebar>
  </form>
</template>
