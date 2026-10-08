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
import AgentContextDocumentPanel from '~/features/agent/components/AgentContextDocumentPanel.vue';
import AgentMemoryPanel from '~/features/agent/components/AgentMemoryPanel.vue';
import AgentToolList from '~/features/agent/components/AgentToolList.vue';
import {
  useCreateAgent,
  useUpdateAgent,
} from '~/features/agent/composables/useAgentApi';
import type { AgentSettings } from '~/features/agent/types';
import AiModelSelector from '~/features/aimodel/components/AiModelSelector.vue';

type UpsertAgentProps = {
  // Present only when editing: an existing agent's id. Absent means create.
  id?: string;
  aiModelId?: string;
  name?: string;
  systemPrompt?: string;
  description?: string;
  context?: string | null;
  tools?: string[];
  isDefault?: boolean;
  settings?: AgentSettings | null;
  defaultDatasetId?: string | null;
};

// Slider position when temperature is unset. 0 doubles as the "disabled"
// position: Anthropic is deprecating the parameter, so an agent with no
// stored temperature (or one dragged back to 0) sends nothing to the model.
const DISABLED_TEMPERATURE = 0;

// shadcn's Select can't use an empty string or null as an item value, so
// "unset" (provider default, nothing sent) needs its own sentinel, mapped
// back to null on change. Distinct from the 'none' option, which is sent to
// the provider to explicitly turn reasoning off.
const REASONING_DEFAULT = 'default';

// Props
const props = defineProps<UpsertAgentProps>();
// Emits

// Refs
const currentTab = ref('persona');

// Composables
const { isPending: isCreating, mutate: createAgent } = useCreateAgent();
const { isPending: isUpdating, mutate: updateAgent } = useUpdateAgent();
const isPending = computed(() => isCreating.value || isUpdating.value);
const { t } = useI18n();

const agentSettingsSchema = z.object({
  temperature: z.number().min(0).max(1).nullable(),
  maxOutputTokens: z.number().int().min(1).max(64_000).nullable(),
  reasoning: z.enum(['none', 'low', 'medium', 'high']).nullable(),
});

const agentUpsertSchema = z.object({
  aiModelId: z.uuidv7(),
  name: z.string().min(4, {
    message: t('agent.upsert.nameRequired'),
  }),
  systemPrompt: z.string(),
  description: z.string(),
  context: z.string().max(30_000),
  tools: z.array(z.string()),
  isDefault: z.boolean(),
  settings: agentSettingsSchema,
  defaultDatasetId: z.uuidv7().nullable(),
});

const form = useForm({
  defaultValues: {
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
      reasoning: props.settings?.reasoning ?? null,
    },
    defaultDatasetId: props.defaultDatasetId ?? null,
  },
  validators: {
    onChange: agentUpsertSchema,
  },
  onSubmit: ({ value }) => {
    if (props.id) {
      updateAgent({ agentId: props.id, ...value });
      return;
    }
    createAgent(value, { onSuccess: () => navigateTo('/agent') });
  },
});

// Computed
const tabsWithErrors = computed<string[]>(() => {
  const errors = form.state.errors;
  return Object.keys(errors);
});
// Functions

// Hooks

const siderBarTabs = computed(() => [
  { id: 'persona', icon: UserIcon, label: t('agent.upsert.tabs.persona') },
  // {
  //   id: 'systemPrompt',
  //   icon: CircleUserRoundIcon,
  //   label: t('agent.upsert.systemPromptTitle'),
  // },
  {
    id: 'aimodel',
    icon: BrainIcon,
    label: t('agent.upsert.tabs.intelligence'),
  },
  {
    id: 'tools',
    icon: BriefcaseBusinessIcon,
    label: t('agent.upsert.tabs.tools'),
  },
  { id: 'context', icon: BookIcon, label: t('agent.upsert.tabs.context') },
  { id: 'memory', icon: NotebookPenIcon, label: t('agent.upsert.tabs.memory') },
  {
    id: 'settings',
    icon: SettingsIcon,
    label: t('agent.upsert.tabs.settings'),
  },
]);
</script>

<template>
  <form @submit.prevent.stop="form.handleSubmit">
    <div class="mb-4 flex w-full justify-end space-x-4">
      <Button as-child variant="secondary">
        <NuxtLinkLocale to="/agent">{{ t('common.cancel') }}</NuxtLinkLocale>
      </Button>
      <Button type="submit" :disabled="isPending">
        <Spinner v-if="isPending" class="mr-2" />
        {{ t('common.save') }}
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
                  {{ t('common.name') }}
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
                  {{ t('common.description') }}
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
                  {{ t('agent.upsert.systemPromptLabel') }}
                </Label>
                <Textarea
                  :id="field.name"
                  rows="10"
                  :model-value="state.value"
                  @update:model-value="
                    (v: string | number) => field.handleChange(String(v))
                  "
                  @blur="field.handleBlur"
                  class="max-h-130 min-h-60"
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
                {{ t('agent.upsert.systemPromptTitle') }}
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
              <form.Field name="defaultDatasetId">
                <template v-slot="{ field: datasetField, state: datasetState }">
                  <AgentToolList
                    :model-value="state.value"
                    :invalid="state.meta.errors.length > 0"
                    :default-dataset-id="datasetState.value"
                    @update:model-value="field.handleChange"
                    @update:default-dataset-id="datasetField.handleChange"
                  />
                </template>
              </form.Field>
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>
      </template>
      <!-- TAB 5: Context -->
      <template #context>
        <div class="mb-8">
          <Label class="mb-2 block text-sm font-medium">{{
            t('agent.upsert.documentsLabel')
          }}</Label>
          <p class="mb-2 text-sm text-muted-foreground">
            {{ t('agent.upsert.documentsHint') }}
          </p>
          <AgentContextDocumentPanel v-if="props.id" :agent-id="props.id" />
          <div
            v-else
            class="rounded-lg border p-4 text-sm text-muted-foreground"
          >
            {{ t('agent.upsert.saveFirstDocuments') }}
          </div>
        </div>
        <form.Field name="context">
          <template v-slot="{ field, state }">
            <div>
              <Label class="mb-2 block text-sm font-medium" :for="field.name">
                {{ t('agent.upsert.contextLabel') }}
              </Label>
              <p class="mb-2 text-sm text-muted-foreground">
                {{ t('agent.upsert.contextHint') }}
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
          {{ t('agent.upsert.saveFirstMemory') }}
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
                <Label :for="field.name">{{
                  t('agent.upsert.defaultAgentLabel')
                }}</Label>
              </div>
            </template>
          </form.Field>
          <div class="space-y-6">
            <form.Field name="settings.temperature">
              <template v-slot="{ field, state }">
                <div>
                  <div class="mb-2 flex items-center justify-between">
                    <Label :id="`${field.name}-label`">{{
                      t('agent.upsert.temperatureLabel')
                    }}</Label>
                    <span class="text-sm text-muted-foreground">
                      {{
                        state.value
                          ? state.value
                          : t('agent.upsert.temperatureDisabled')
                      }}
                    </span>
                  </div>
                  <Slider
                    :aria-labelledby="`${field.name}-label`"
                    :model-value="[state.value ?? DISABLED_TEMPERATURE]"
                    :min="0"
                    :max="1"
                    :step="0.05"
                    @update:model-value="
                      (v) => field.handleChange(v?.[0] ? v[0] : null)
                    "
                  />
                  <p class="mt-2 text-sm text-muted-foreground">
                    {{ t('agent.upsert.temperatureHint') }}
                  </p>
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
                    {{ t('agent.upsert.maxOutputTokensLabel') }}
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
                  <p class="mt-2 text-sm text-muted-foreground">
                    {{ t('agent.upsert.maxOutputTokensHint') }}
                  </p>
                  <FormFieldInfo :state="state" />
                </div>
              </template>
            </form.Field>
            <form.Field name="settings.reasoning">
              <template v-slot="{ field, state }">
                <div>
                  <Label
                    class="mb-2 block text-sm font-medium"
                    :for="field.name"
                  >
                    {{ t('agent.upsert.reasoningLabel') }}
                  </Label>
                  <Select
                    :model-value="state.value ?? REASONING_DEFAULT"
                    @update:model-value="
                      (v) =>
                        field.handleChange(
                          v === REASONING_DEFAULT
                            ? null
                            : (v as 'none' | 'low' | 'medium' | 'high'),
                        )
                    "
                  >
                    <SelectTrigger :id="field.name" class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="REASONING_DEFAULT">
                        {{ t('agent.upsert.reasoningDefault') }}
                      </SelectItem>
                      <SelectItem value="none">
                        {{ t('agent.upsert.reasoningOff') }}
                      </SelectItem>
                      <SelectItem value="low">
                        {{ t('agent.upsert.reasoningLow') }}
                      </SelectItem>
                      <SelectItem value="medium">
                        {{ t('agent.upsert.reasoningMedium') }}
                      </SelectItem>
                      <SelectItem value="high">
                        {{ t('agent.upsert.reasoningHigh') }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p class="mt-2 text-sm text-muted-foreground">
                    {{ t('agent.upsert.reasoningHint') }}
                  </p>
                  <FormFieldInfo :state="state" />
                </div>
              </template>
            </form.Field>
          </div>
        </div>
      </template>
    </TabSidebar>
  </form>
</template>
