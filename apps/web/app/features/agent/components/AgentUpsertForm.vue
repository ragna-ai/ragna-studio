<script setup lang="ts">
import {
  BookIcon,
  BrainIcon,
  BriefcaseBusinessIcon,
  NotebookPenIcon,
  SettingsIcon,
  UserIcon,
} from '@lucide/vue';
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import AgentDocumentPanel from '~/features/agent/components/AgentDocumentPanel.vue';
import AgentMemoryPanel from '~/features/agent/components/AgentMemoryPanel.vue';
import AgentToolList from '~/features/agent/components/AgentToolList.vue';
import { useUpsertAgent } from '~/features/agent/composables/useAgentApi';
import type { AgentSettings } from '~/features/agent/types';
import AiModelSelector from '~/features/aimodel/components/AiModelSelector.vue';

type UpsertAgentProps = {
  id?: string;
  userId?: string;
  aiModelId?: string;
  name?: string;
  systemPrompt?: string;
  description?: string;
  context?: string | null;
  tools?: string[];
  isDefault?: boolean;
  settings?: AgentSettings | null;
};

// Slider position when temperature is unset. 0 doubles as the "disabled"
// position: Anthropic is deprecating the parameter, so an agent with no
// stored temperature (or one dragged back to 0) sends nothing to the model.
const DISABLED_TEMPERATURE = 0;

const agentSettingsSchema = z.object({
  temperature: z.number().min(0).max(1).nullable(),
  maxOutputTokens: z.number().int().min(1).max(64_000).nullable(),
});

const agentUpsertSchema = z.object({
  id: z.uuidv7().nullable(),
  userId: z.uuidv7().nullable(),
  aiModelId: z.uuidv7(),
  name: z.string().min(4, {
    message: 'Name must be at least 4 characters.',
  }),
  systemPrompt: z.string(),
  description: z.string(),
  context: z.string().max(30_000),
  tools: z.array(z.string()),
  isDefault: z.boolean(),
  settings: agentSettingsSchema,
});

// Props
const props = defineProps<UpsertAgentProps>();
// Emits

// Refs
const currentTab = ref('persona');

// Composables
const { isPending, mutate } = useUpsertAgent();

const form = useForm({
  defaultValues: {
    id: props.id ?? null,
    userId: props.userId ?? null,
    aiModelId: props.aiModelId ?? '',
    name: props.name ?? '',
    systemPrompt: props.systemPrompt ?? 'You are a helpful assistant.',
    description: props.description ?? '',
    context: props.context ?? '',
    tools: props.tools ?? [],
    isDefault: props.isDefault ?? false,
    settings: {
      temperature: props.settings?.temperature ?? null,
      maxOutputTokens: props.settings?.maxOutputTokens ?? null,
    },
  },
  validators: {
    onChange: agentUpsertSchema,
  },
  onSubmit: ({ value }) =>
    mutate(value, {
      onSuccess: () => {
        if (!props.id) navigateTo('/agent');
      },
    }),
});

// Computed
const tabsWithErrors = computed<string[]>(() => {
  const errors = form.state.errors;
  return Object.keys(errors);
});
// Functions

// Hooks

const siderBarTabs = [
  { id: 'persona', icon: UserIcon, label: 'Persona' },
  // {
  //   id: 'systemPrompt',
  //   icon: CircleUserRoundIcon,
  //   label: 'System Prompt',
  // },
  { id: 'aimodel', icon: BrainIcon, label: 'Intelligence' },
  {
    id: 'tools',
    icon: BriefcaseBusinessIcon,
    label: 'Tools',
  },
  { id: 'context', icon: BookIcon, label: 'Context' },
  { id: 'memory', icon: NotebookPenIcon, label: 'Memory' },
  {
    id: 'settings',
    icon: SettingsIcon,
    label: 'Settings',
  },
];
</script>

<template>
  <form @submit.prevent.stop="form.handleSubmit">
    <div class="mb-4 flex w-full justify-end space-x-4">
      <Button as-child variant="secondary">
        <NuxtLinkLocale to="/agent">Cancel</NuxtLinkLocale>
      </Button>
      <Button type="submit" :disabled="isPending">
        <Spinner v-if="isPending" class="mr-2" />
        Save
      </Button>
    </div>
    <TabSidebar
      v-model="currentTab"
      :tabs="siderBarTabs"
      :error-tabs="tabsWithErrors"
    >
      <!-- TAB 1: Persona -->
      <template #persona>
        <div class="space-y-8">
          <form.Field name="name">
            <template v-slot="{ field, state }">
              <div>
                <Label class="mb-2 block text-sm font-medium" :for="field.name">
                  Name
                </Label>
                <InputGroup>
                  <InputGroupAddon>
                    <UserIcon class="text-muted-foreground" />
                  </InputGroupAddon>
                  <InputGroupInput
                    :id="field.name"
                    :model-value="state.value"
                    @update:model-value="
                      (v: string | number) => field.handleChange(String(v))
                    "
                    @blur="field.handleBlur"
                    autocomplete="off"
                  />
                </InputGroup>
                <FormFieldInfo :state="state" />
              </div>
            </template>
          </form.Field>
          <!-- Description -->
          <form.Field name="description">
            <template v-slot="{ field, state }">
              <div class="hidden">
                <Label class="mb-2 block text-sm font-medium" :for="field.name">
                  Description
                </Label>
                <Textarea
                  :id="field.name"
                  rows="4"
                  :model-value="state.value"
                  @update:model-value="
                    (v: string | number) => field.handleChange(String(v))
                  "
                  @blur="field.handleBlur"
                  autocomplete="off"
                />
                <FormFieldInfo :state="state" />
              </div>
            </template>
          </form.Field>
          <form.Field name="systemPrompt">
            <template v-slot="{ field, state }">
              <div>
                <Label class="mb-2 block text-sm font-medium" :for="field.name">
                  Behavior / Instructions
                </Label>
                <Textarea
                  :id="field.name"
                  rows="10"
                  :model-value="state.value"
                  @update:model-value="
                    (v: string | number) => field.handleChange(String(v))
                  "
                  @blur="field.handleBlur"
                  class="min-h-100"
                  autocomplete="off"
                />
                <FormFieldInfo :state="state" />
              </div>
            </template>
          </form.Field>
        </div>
      </template>
      <!-- TAB 2: Instructions -->
      <template #instructions>
        <form.Field name="systemPrompt">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                System Prompt
              </Label>
              <Textarea
                :id="field.name"
                rows="10"
                :model-value="state.value"
                @update:model-value="
                  (v: string | number) => field.handleChange(String(v))
                "
                @blur="field.handleBlur"
                class="min-h-100"
                autocomplete="off"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>
      </template>
      <!-- TAB 3: AI Model -->
      <template #aimodel>
        <form.Field name="aiModelId">
          <template v-slot="{ field, state }">
            <div class="space-y-2">
              <AiModelSelector
                :model-value="state.value"
                modality="text"
                @update:model-value="(value) => field.handleChange(value ?? '')"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>
      </template>
      <!-- TAB 4: Tools -->
      <template #tools>
        <form.Field name="tools">
          <template v-slot="{ field, state }">
            <div class="space-y-6">
              <AgentToolList
                :model-value="state.value"
                :invalid="state.meta.errors.length > 0"
                @update:model-value="field.handleChange"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>
      </template>
      <!-- TAB 5: Context -->
      <template #context>
        <div class="mb-8">
          <Label class="mb-2 block text-sm font-medium">Documents</Label>
          <p class="mb-2 text-sm text-muted-foreground">
            Upload files whose content this agent should always have access to.
            Extracted text joins the context text below.
          </p>
          <AgentDocumentPanel v-if="props.id" :agent-id="props.id" />
          <div
            v-else
            class="rounded-lg border p-4 text-sm text-muted-foreground"
          >
            Save the agent first to upload documents.
          </div>
        </div>
        <form.Field name="context">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                Context
              </Label>
              <p class="mb-2 text-sm text-muted-foreground">
                Background knowledge this agent should always have. For behavior
                and rules, use Persona.
              </p>
              <Textarea
                :id="field.name"
                rows="10"
                :model-value="state.value"
                @update:model-value="
                  (v: string | number) => field.handleChange(String(v))
                "
                @blur="field.handleBlur"
                class="min-h-60"
                autocomplete="off"
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>
      </template>
      <!-- TAB 6: Memory -->
      <template #memory>
        <AgentMemoryPanel v-if="props.id" :agent-id="props.id" />
        <div v-else class="rounded-lg border p-4 text-sm text-muted-foreground">
          Save the agent first to view and edit its memory.
        </div>
      </template>
      <!-- TAB 7: Settings -->
      <template #settings>
        <div class="max-w-lg space-y-8">
          <form.Field name="isDefault">
            <template v-slot="{ field, state }">
              <div class="flex items-center space-x-3">
                <Switch
                  :id="field.name"
                  :model-value="state.value"
                  @update:model-value="field.handleChange"
                />
                <Label :for="field.name">Make this the default agent</Label>
              </div>
            </template>
          </form.Field>
          <div class="space-y-6">
            <form.Field name="settings.temperature">
              <template v-slot="{ field, state }">
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <Label :for="field.name">Temperature</Label>
                    <span class="text-sm text-muted-foreground">
                      {{ state.value ? state.value : 'Disabled' }}
                    </span>
                  </div>
                  <Slider
                    :id="field.name"
                    :model-value="[state.value ?? DISABLED_TEMPERATURE]"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    @update:model-value="
                      (v) => field.handleChange(v?.[0] ? v[0] : null)
                    "
                  />
                  <FormFieldInfo :state="state" />
                </div>
              </template>
            </form.Field>
            <form.Field name="settings.maxOutputTokens">
              <template v-slot="{ field, state }">
                <div>
                  <Label
                    class="mb-2 block text-sm font-medium"
                    :for="field.name"
                  >
                    Max output tokens
                  </Label>
                  <Input
                    :id="field.name"
                    type="number"
                    min="1"
                    max="64000"
                    :model-value="state.value ?? ''"
                    @update:model-value="
                      (v: string | number) =>
                        field.handleChange(v === '' ? null : Number(v))
                    "
                    @blur="field.handleBlur"
                    autocomplete="off"
                  />
                  <FormFieldInfo :state="state" />
                </div>
              </template>
            </form.Field>
            <p class="text-sm text-muted-foreground">
              Set temperature to 0 to disable it. Leave max output tokens empty
              to use the model's default.
            </p>
          </div>
        </div>
      </template>
    </TabSidebar>
  </form>
</template>
