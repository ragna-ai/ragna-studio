<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import {
  AGENT_CONTEXT_MAX_LENGTH,
  AGENT_INSTRUCTIONS_MAX_LENGTH,
  agentToolGrantsSchema,
  type AgentToolGrant,
} from '@repo/ai/client';
import { z } from 'zod';
import {
  fieldMessageId,
  isFieldErrorVisible,
} from '~/components/form/field-error';
import MarkdownEditorField from '~/components/editor/MarkdownEditorField.vue';
import AgentContextDocumentPanel from '~/features/agent/components/AgentContextDocumentPanel.vue';
import AgentMark from '~/features/agent/components/AgentMark.vue';
import AgentMemoryPanel from '~/features/agent/components/AgentMemoryPanel.vue';
import AgentSettingsSectionTitle from '~/features/agent/components/AgentSettingsSectionTitle.vue';
import AgentToolList from '~/features/agent/components/AgentToolList.vue';
import {
  useCreateAgent,
  useGetAgentMemory,
  useUpdateAgent,
  useUpdateAgentMemory,
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
  toolGrants?: AgentToolGrant[];
  settings?: AgentSettings | null;
  defaultDatasetId?: string | null;
};

// Slider position when temperature is unset. 0 doubles as the "disabled"
// position: Anthropic is deprecating the parameter, so an agent with no
// stored temperature (or one dragged back to 0) sends nothing to the model.
const DISABLED_TEMPERATURE = 0;

const TAB_BY_FIELD: Record<string, string> = {
  name: 'persona',
  description: 'persona',
  systemPrompt: 'persona',
  aiModelId: 'model',
  'settings.temperature': 'model',
  'settings.maxOutputTokens': 'model',
  'settings.reasoning': 'model',
  toolGrants: 'tools',
  defaultDatasetId: 'tools',
  context: 'context',
};

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
const advancedOpen = ref(false);
const formElement = useTemplateRef<HTMLFormElement>('formElement');
const memory = ref('');
const loadedMemory = ref<string | null>(null);

// Composables
const { isPending: isCreating, mutate: createAgent } = useCreateAgent();
const { isPending: isUpdating, mutate: updateAgent } = useUpdateAgent();
const { isPending: isSavingMemory, mutate: updateMemory } =
  useUpdateAgentMemory();
const { data: memoryData, isPending: isMemoryLoading } = useGetAgentMemory(
  () => props.id ?? '',
);
const isPending = computed(
  () => isCreating.value || isUpdating.value || isSavingMemory.value,
);
const { n, t } = useI18n();

const agentSettingsSchema = z.object({
  temperature: z.number().min(0).max(1).nullable(),
  maxOutputTokens: z
    .number()
    .int({ message: t('agent.upsert.maxOutputTokensInvalid') })
    .min(1, { message: t('agent.upsert.maxOutputTokensInvalid') })
    .max(64_000, { message: t('agent.upsert.maxOutputTokensInvalid') })
    .nullable(),
  reasoning: z.enum(['none', 'low', 'medium', 'high']).nullable(),
});

const agentUpsertSchema = z.object({
  aiModelId: z.uuidv7({ message: t('agent.upsert.modelRequired') }),
  name: z.string().min(4, {
    message: t('agent.upsert.nameRequired'),
  }),
  systemPrompt: z.string().max(AGENT_INSTRUCTIONS_MAX_LENGTH, {
    message: t('common.maxLength', { max: n(AGENT_INSTRUCTIONS_MAX_LENGTH) }),
  }),
  description: z.string(),
  context: z.string().max(AGENT_CONTEXT_MAX_LENGTH, {
    message: t('common.maxLength', { max: n(AGENT_CONTEXT_MAX_LENGTH) }),
  }),
  toolGrants: agentToolGrantsSchema,
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
    toolGrants: props.toolGrants ?? [],
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
      const agentId = props.id;
      updateAgent(
        { agentId, ...value },
        { onSuccess: () => saveMemoryIfChanged(agentId) },
      );
      return;
    }
    createAgent(value, { onSuccess: () => navigateTo('/agent') });
  },
  onSubmitInvalid: () => revealFirstInvalidField(),
});

const fieldMeta = form.useStore((state) => state.fieldMeta);

// Computed
const fieldsWithErrors = computed(() =>
  Object.entries(fieldMeta.value)
    .filter(([, meta]) => (meta?.errors.length ?? 0) > 0)
    .map(([name]) => name),
);
const submissionAttempts = form.useStore((state) => state.submissionAttempts);
const tabsWithErrors = computed(() => [
  ...new Set(
    Object.entries(fieldMeta.value).flatMap(([name, meta]) =>
      meta &&
      meta.errors.length > 0 &&
      (meta.isBlurred || submissionAttempts.value > 0)
        ? (TAB_BY_FIELD[name] ?? [])
        : [],
    ),
  ),
]);
const hasAdvancedError = computed(() =>
  Object.entries(fieldMeta.value).some(
    ([name, meta]) =>
      name.startsWith('settings.') &&
      meta &&
      meta.errors.length > 0 &&
      (meta.isBlurred || submissionAttempts.value > 0),
  ),
);
const agentLabel = computed(() => props.name || t('agent.upsert.thisAgent'));
const temperatureText = (temperature: number | null) =>
  temperature ? temperature.toFixed(2) : t('agent.upsert.temperatureDisabled');
const siderBarTabs = computed(() => [
  {
    id: 'persona',
    icon: 'hugeicons:user',
    label: t('agent.upsert.tabs.persona'),
  },
  {
    id: 'model',
    icon: 'hugeicons:ai-chip',
    label: t('agent.upsert.tabs.model'),
  },
  {
    id: 'tools',
    icon: 'hugeicons:wrench-01',
    label: t('agent.upsert.tabs.tools'),
  },
  {
    id: 'context',
    icon: 'hugeicons:book-open-01',
    label: t('agent.upsert.tabs.context'),
  },
  {
    id: 'memory',
    icon: 'hugeicons:notebook-02',
    label: t('agent.upsert.tabs.memory'),
  },
]);

// Functions
async function revealFirstInvalidField() {
  const invalidTabs = new Set(
    fieldsWithErrors.value.flatMap((name) => TAB_BY_FIELD[name] ?? []),
  );
  const firstTab = siderBarTabs.value.find((tab) => invalidTabs.has(tab.id));
  if (!firstTab) return;
  currentTab.value = firstTab.id;
  if (fieldsWithErrors.value.some((name) => name.startsWith('settings.'))) {
    advancedOpen.value = true;
  }
  await nextTick();
  const invalid = formElement.value?.querySelector<HTMLElement>(
    `#panel-${firstTab.id} [aria-invalid="true"]`,
  );
  const target = invalid?.matches('input, textarea, button')
    ? invalid
    : invalid?.querySelector<HTMLElement>(
        '[contenteditable="true"], textarea, input, button',
      );
  target?.focus();
}

function saveMemoryIfChanged(agentId: string) {
  const content = memory.value;
  if (loadedMemory.value === null || content === loadedMemory.value) return;
  updateMemory(
    { agentId, content },
    { onSuccess: () => (loadedMemory.value = content) },
  );
}

// Hooks
// Load the memory once: later refetches (e.g. after save) must not
// clobber edits the user is currently making.
watch(
  () => memoryData.value?.memory.content,
  (content) => {
    if (loadedMemory.value !== null || content === undefined) return;
    memory.value = content;
    loadedMemory.value = content;
  },
  { immediate: true },
);
// Validation errors must never hide inside the closed disclosure.
watch(hasAdvancedError, (hasError) => {
  if (hasError) advancedOpen.value = true;
});
</script>

<template>
  <form
    ref="formElement"
    class="flex min-h-0 flex-1 flex-col"
    @submit.prevent.stop="form.handleSubmit"
  >
    <header class="mb-8 flex shrink-0 items-start justify-between gap-4">
      <div class="flex min-w-0 items-start gap-3">
        <AgentMark v-if="props.id" :agent-id="props.id" :size="28" />
        <div class="min-w-0">
          <h1 class="truncate text-lg font-semibold">
            {{
              props.id
                ? props.name || t('agent.upsert.untitled')
                : t('agent.list.newAgent')
            }}
          </h1>
          <p v-if="props.description" class="text-sm text-muted-foreground">
            {{ props.description }}
          </p>
        </div>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button as-child variant="outline">
          <NuxtLinkLocale to="/agent">{{ t('common.cancel') }}</NuxtLinkLocale>
        </Button>
        <Button type="submit" :disabled="isPending" :loading="isPending">
          {{ t('common.save') }}
        </Button>
      </div>
    </header>
    <TabSidebar
      v-model="currentTab"
      :tabs="siderBarTabs"
      :error-tabs="tabsWithErrors"
    >
      <!-- Persona -->
      <template #persona>
        <AgentSettingsSectionTitle
          :title="t('agent.upsert.tabs.persona')"
          :subtitle="t('agent.upsert.personaSubtitle')"
        />
        <form.Field name="name">
          <template v-slot="{ field, state }">
            <div class="flex flex-col gap-2">
              <Label class="text-sm font-medium" :for="field.name">
                {{ t('common.name') }}
              </Label>
              <div>
                <Input
                  :id="field.name"
                  :aria-invalid="
                    isFieldErrorVisible(field, submissionAttempts) || undefined
                  "
                  :aria-describedby="fieldMessageId(field)"
                  :model-value="state.value"
                  autocomplete="off"
                  @update:model-value="
                    (v: string | number) => field.handleChange(String(v))
                  "
                  @blur="field.handleBlur"
                />
                <FormFieldInfo :field="field" />
              </div>
            </div>
          </template>
        </form.Field>
        <form.Field name="description">
          <template v-slot="{ field, state }">
            <div class="flex flex-col gap-2">
              <Label class="text-sm font-medium" :for="field.name">
                {{ t('common.description') }}
              </Label>
              <div>
                <Textarea
                  :id="field.name"
                  :aria-invalid="
                    isFieldErrorVisible(field, submissionAttempts) || undefined
                  "
                  :aria-describedby="fieldMessageId(field)"
                  rows="3"
                  :model-value="state.value"
                  autocomplete="off"
                  @update:model-value="
                    (v: string | number) => field.handleChange(String(v))
                  "
                  @blur="field.handleBlur"
                />
                <FormFieldInfo
                  :field="field"
                  :hint="t('agent.upsert.descriptionHint')"
                />
              </div>
            </div>
          </template>
        </form.Field>
        <form.Field name="systemPrompt">
          <template v-slot="{ field, state }">
            <div class="flex min-h-80 flex-col">
              <MarkdownEditorField
                :model-value="state.value"
                :aria-labelledby="`${field.name}-label`"
                :invalid="isFieldErrorVisible(field, submissionAttempts)"
                :max-length="AGENT_INSTRUCTIONS_MAX_LENGTH"
                :placeholder="t('agent.upsert.systemPromptPlaceholder')"
                :panel-title="t('agent.upsert.systemPromptLabel')"
                class="min-h-60"
                @update:model-value="field.handleChange"
                @blur="field.handleBlur"
              >
                <template #label>
                  <Label
                    :id="`${field.name}-label`"
                    class="block text-sm font-medium"
                  >
                    {{ t('agent.upsert.systemPromptLabel') }}
                  </Label>
                </template>
              </MarkdownEditorField>
              <FormFieldInfo :field="field" />
            </div>
          </template>
        </form.Field>
      </template>
      <!-- Model -->
      <template #model>
        <AgentSettingsSectionTitle
          :title="t('agent.upsert.tabs.model')"
          :subtitle="t('agent.upsert.modelSubtitle')"
        />
        <form.Field name="aiModelId">
          <template v-slot="{ field, state }">
            <div class="flex flex-col gap-2">
              <Label class="text-sm font-medium">
                {{ t('agent.upsert.modelLabel') }}
              </Label>
              <div>
                <AiModelSelector
                  :model-value="state.value"
                  modality="text"
                  :invalid="isFieldErrorVisible(field, submissionAttempts)"
                  @update:model-value="
                    (value) => field.handleChange(value ?? '')
                  "
                />
                <FormFieldInfo :field="field" />
              </div>
            </div>
          </template>
        </form.Field>
        <div class="flex flex-col gap-4">
          <Separator />
          <Collapsible v-model:open="advancedOpen">
            <CollapsibleRow
              :label="t('agent.upsert.advancedLabel')"
              :hint="t('agent.upsert.advancedHint')"
            />
            <CollapsibleContent>
              <div class="flex flex-col gap-8 pt-2 pl-6">
                <form.Field name="settings.reasoning">
                  <template v-slot="{ field, state }">
                    <div class="flex flex-col gap-2">
                      <Label class="text-sm font-medium" :for="field.name">
                        {{ t('agent.upsert.reasoningLabel') }}
                      </Label>
                      <div>
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
                          <SelectTrigger
                            :id="field.name"
                            :aria-invalid="
                              isFieldErrorVisible(field, submissionAttempts) ||
                              undefined
                            "
                            :aria-describedby="fieldMessageId(field)"
                            class="w-full"
                          >
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
                        <FormFieldInfo
                          :field="field"
                          :hint="t('agent.upsert.reasoningHint')"
                        />
                      </div>
                    </div>
                  </template>
                </form.Field>
                <form.Field name="settings.temperature">
                  <template v-slot="{ field, state }">
                    <div class="flex flex-col gap-2">
                      <Label
                        :id="`${field.name}-label`"
                        class="text-sm font-medium"
                      >
                        {{ t('agent.upsert.temperatureLabel') }}
                      </Label>
                      <div>
                        <div class="flex items-center gap-3">
                          <Slider
                            class="w-60"
                            :aria-labelledby="`${field.name}-label`"
                            :model-value="[state.value ?? DISABLED_TEMPERATURE]"
                            :min="0"
                            :max="1"
                            :step="0.05"
                            @update:model-value="
                              (v) => field.handleChange(v?.[0] ? v[0] : null)
                            "
                          />
                          <span class="text-mono text-foreground">
                            {{ temperatureText(state.value) }}
                          </span>
                        </div>
                        <FormFieldInfo
                          :field="field"
                          :hint="t('agent.upsert.temperatureHint')"
                        />
                      </div>
                    </div>
                  </template>
                </form.Field>
                <form.Field name="settings.maxOutputTokens">
                  <template v-slot="{ field, state }">
                    <div class="flex flex-col gap-2">
                      <Label class="text-sm font-medium" :for="field.name">
                        {{ t('agent.upsert.maxOutputTokensLabel') }}
                      </Label>
                      <div>
                        <Input
                          :id="field.name"
                          :aria-invalid="
                            isFieldErrorVisible(field, submissionAttempts) ||
                            undefined
                          "
                          :aria-describedby="fieldMessageId(field)"
                          type="number"
                          min="1"
                          max="64000"
                          class="w-60"
                          :placeholder="
                            t('agent.upsert.maxOutputTokensPlaceholder')
                          "
                          :model-value="state.value ?? ''"
                          autocomplete="off"
                          @update:model-value="
                            (v: string | number) =>
                              field.handleChange(v === '' ? null : Number(v))
                          "
                          @blur="field.handleBlur"
                        />
                        <FormFieldInfo
                          :field="field"
                          :hint="t('agent.upsert.maxOutputTokensHint')"
                        />
                      </div>
                    </div>
                  </template>
                </form.Field>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </template>
      <!-- Tools -->
      <template #tools>
        <AgentSettingsSectionTitle
          :title="t('agent.upsert.tabs.tools')"
          :subtitle="t('agent.upsert.toolsSubtitle', { name: agentLabel })"
        />
        <form.Field name="toolGrants">
          <template v-slot="{ field, state }">
            <div>
              <form.Field name="defaultDatasetId">
                <template v-slot="{ field: datasetField, state: datasetState }">
                  <AgentToolList
                    :model-value="state.value"
                    :invalid="isFieldErrorVisible(field, submissionAttempts)"
                    :default-dataset-id="datasetState.value"
                    @update:model-value="field.handleChange"
                    @update:default-dataset-id="datasetField.handleChange"
                  />
                </template>
              </form.Field>
              <FormFieldInfo :field="field" />
            </div>
          </template>
        </form.Field>
      </template>
      <!-- Context -->
      <template #context>
        <AgentSettingsSectionTitle
          :title="t('agent.upsert.tabs.context')"
          :subtitle="t('agent.upsert.contextSubtitle')"
        />
        <div class="flex flex-col gap-2">
          <Label class="text-sm font-medium">
            {{ t('agent.upsert.documentsLabel') }}
          </Label>
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
            <div class="flex min-h-80 flex-col">
              <MarkdownEditorField
                :model-value="state.value"
                :aria-labelledby="`${field.name}-label`"
                :invalid="isFieldErrorVisible(field, submissionAttempts)"
                :max-length="AGENT_CONTEXT_MAX_LENGTH"
                :placeholder="t('agent.upsert.contextPlaceholder')"
                :panel-title="t('agent.upsert.contextLabel')"
                class="min-h-60"
                @update:model-value="field.handleChange"
                @blur="field.handleBlur"
              >
                <template #label>
                  <Label
                    :id="`${field.name}-label`"
                    class="block text-sm font-medium"
                  >
                    {{ t('agent.upsert.contextLabel') }}
                  </Label>
                </template>
              </MarkdownEditorField>
              <FormFieldInfo :field="field" />
            </div>
          </template>
        </form.Field>
      </template>
      <!-- Memory -->
      <template #memory>
        <AgentSettingsSectionTitle
          :title="t('agent.upsert.tabs.memory')"
          :subtitle="t('agent.upsert.memorySubtitle', { name: agentLabel })"
        />
        <AgentMemoryPanel
          v-if="props.id"
          v-model="memory"
          :loading="isMemoryLoading"
        />
        <div v-else class="rounded-lg border p-4 text-sm text-muted-foreground">
          {{ t('agent.upsert.saveFirstMemory') }}
        </div>
      </template>
    </TabSidebar>
  </form>
</template>
