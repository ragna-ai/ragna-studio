<script setup lang="ts">
import {
  BookIcon,
  BriefcaseBusinessIcon,
  CircleUserRoundIcon,
  SettingsIcon,
  ShieldCheckIcon,
  StarsIcon,
  UserIcon,
} from '@lucide/vue';
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import { useUpsertAgent } from '~/features/agent/composables/useAgentApi';

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
  id: z.uuidv7().nullable(),
  userId: z.uuidv7().nullable(),
  aiModelId: z.uuidv7(),
  name: z.string().min(4, {
    message: 'Name must be at least 4 characters.',
  }),
  systemPrompt: z.string(),
  description: z.string(),
  tools: z.array(z.string()),
  isDefault: z.boolean(),
});

// Props
const props = defineProps<UpsertAgentProps>();
// Emits

// Refs
const currentTab = ref('settings');

// Composables
const { isPending, mutate } = useUpsertAgent();

const form = useForm({
  defaultValues: {
    id: props.id ?? null,
    userId: props.userId ?? null,
    aiModelId: props.aiModelId ?? '',
    name: props.name ?? '',
    systemPrompt: props.systemPrompt ?? '',
    description: props.description ?? '',
    tools: props.tools ?? [],
    isDefault: props.isDefault ?? false,
  },
  validators: {
    onChange: agentUpsertSchema,
  },
  onSubmit: ({ value }) => mutate(value),
});

// Subscribe to the form's error map so that updates to it will render
// alternately, you can use `form.Subscribe`
const formErrorMap = form.useStore((state) => state.errorMap);

// Computed
const tabsWithErrors = computed<string[]>(() => {
  const errors = form.state.errors;
  return Object.keys(errors);
});
// Functions

// Hooks

const siderBarTabs = [
  { id: 'settings', icon: SettingsIcon, label: 'Settings' },
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
    id: 'privacy',
    icon: ShieldCheckIcon,
    label: 'Privacy',
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
      <!-- TAB 1: Settings -->
      <template #settings>
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
                  />
                </InputGroup>
                <FormFieldInfo :state="state" />
              </div>
            </template>
          </form.Field>
          <form.Field name="description">
            <template v-slot="{ field, state }">
              <div>
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
                />
                <FormFieldInfo :state="state" />
              </div>
            </template>
          </form.Field>
        </div>
      </template>
      <!-- TAB 2: System Prompt -->
      <template #systemPrompt>
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
              />
              <FormFieldInfo :state="state" />
            </div>
          </template>
        </form.Field>
      </template>
      <!-- TAB 3: GenAI -->
      <template #llmId>
        <div class="rounded-lg border p-4 text-sm text-muted-foreground">
          Model selection isn't available yet.
        </div>
      </template>
      <!-- TAB 4: Tools -->
      <template #tools>
        <div class="rounded-lg border p-4 text-sm text-muted-foreground">
          Tool selection isn't available yet.
        </div>
      </template>
      <!-- TAB 5: Knowledge -->
      <template #knowledge>
        <div class="rounded-lg border p-4 text-sm text-muted-foreground">
          Save the agent first to configure its knowledge base.
        </div>
      </template>
      <!-- TAB 6: Privacy -->
      <template #privacy>
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
      </template>
    </TabSidebar>
  </form>
</template>
