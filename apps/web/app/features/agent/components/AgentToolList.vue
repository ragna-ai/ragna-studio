<script setup lang="ts">
import { CheckIcon, CloudIcon, type LucideIcon } from '@lucide/vue';
import { AGENT_TOOL_VISUALS } from '~/features/agent/lib/agent-tool-icons';
import {
  INTEGRATION_CATALOG,
  type CloudDriveIntegrationId,
  type IntegrationToolAccessLevel,
  type IntegrationTools,
} from '@repo/integrations/catalog';
import { useGetIntegrationConnections } from '~/features/integrations/composables/useIntegrationApi';
import { CONNECTIONS_PAGE_PATH } from '~/features/integrations/lib/integration-meta';
import { useGetAllDatasetsForPicker } from '~/features/dataset/composables/useDatasetApi';

type AgentToolListProps = {
  modelValue: string[];
  invalid?: boolean;
  defaultDatasetId?: string | null;
  integrationTools?: IntegrationTools;
};

type AgentToolListEmit = {
  'update:modelValue': [value: string[]];
  'update:defaultDatasetId': [value: string | null];
  'update:integrationTools': [value: IntegrationTools];
};

// shadcn's Select can't use an empty string as an item value (it's the
// internal "no selection" sentinel), so a "None" option needs its own
// placeholder value, mapped back to `null` on change. Same pattern as
// WorkflowAgentConfigForm's NO_AGENT.
const NO_DATASET = '__none__';

// Imports
const props = withDefaults(defineProps<AgentToolListProps>(), {
  invalid: false,
  defaultDatasetId: null,
  integrationTools: () => ({}),
});

const emit = defineEmits<AgentToolListEmit>();

// Props
// Emits

// Refs

// Composables
const { data: datasetsData } = useGetAllDatasetsForPicker();
const { data: connectionsData } = useGetIntegrationConnections();

// Computed
const pickerDatasets = computed(() => datasetsData.value?.datasets ?? []);
const cloudDriveIds = INTEGRATION_CATALOG.filter(
  (integration) => integration.category === 'cloud-drive',
).map((integration) => integration.id as CloudDriveIntegrationId);
const connectedIntegrationIds = computed(
  () =>
    new Set(
      connectionsData.value?.connections.flatMap(
        (connection) => connection.integrations,
      ) ?? [],
    ),
);
// Functions

// Hooks

interface UiAgentTool {
  id: string;
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
}

const availableTools: UiAgentTool[] = [
  {
    id: 'think',
    icon: AGENT_TOOL_VISUALS.think.icon,
    titleKey: 'agent.tool.think.label',
    descriptionKey: 'agent.tool.think.description',
  },
  {
    id: 'memory',
    icon: AGENT_TOOL_VISUALS.memory.icon,
    titleKey: 'agent.tool.memory.label',
    descriptionKey: 'agent.tool.memory.description',
  },
  {
    id: 'webSearch',
    icon: AGENT_TOOL_VISUALS.webSearch.icon,
    titleKey: 'agent.tool.webSearch.label',
    descriptionKey: 'agent.tool.webSearch.description',
  },
  {
    id: 'webBrowser',
    icon: AGENT_TOOL_VISUALS.webBrowser.icon,
    titleKey: 'agent.tool.webBrowser.label',
    descriptionKey: 'agent.tool.webBrowser.description',
  },
  {
    id: 'imageGen',
    icon: AGENT_TOOL_VISUALS.imageGen.icon,
    titleKey: 'agent.tool.imageGen.label',
    descriptionKey: 'agent.tool.imageGen.description',
  },
  {
    id: 'videoGen',
    icon: AGENT_TOOL_VISUALS.videoGen.icon,
    titleKey: 'agent.tool.videoGen.label',
    descriptionKey: 'agent.tool.videoGen.description',
  },
  {
    id: 'linkedinDraft',
    icon: AGENT_TOOL_VISUALS.linkedinDraft.icon,
    titleKey: 'agent.tool.linkedinDraft.label',
    descriptionKey: 'agent.tool.linkedinDraft.description',
  },
  {
    id: 'documents',
    icon: AGENT_TOOL_VISUALS.documents.icon,
    titleKey: 'agent.tool.documents.label',
    descriptionKey: 'agent.tool.documents.description',
  },
  {
    id: 'tasks',
    icon: AGENT_TOOL_VISUALS.tasks.icon,
    titleKey: 'agent.tool.tasks.label',
    descriptionKey: 'agent.tool.tasks.description',
  },
  {
    id: 'datasets',
    icon: AGENT_TOOL_VISUALS.datasets.icon,
    titleKey: 'agent.tool.datasets.label',
    descriptionKey: 'agent.tool.datasets.description',
  },
];

// Computed
const selectedTools = computed(() => props.modelValue);

// Functions
const handleCheckedChange = (toolId: string, checked: boolean) => {
  const isChecked = checked === true;
  const newValue = isChecked
    ? [...selectedTools.value, toolId]
    : selectedTools.value.filter((id) => id !== toolId);

  emit('update:modelValue', newValue);
};

const handleIntegrationToggle = (id: CloudDriveIntegrationId, on: boolean) => {
  const { [id]: _removed, ...rest } = props.integrationTools;
  emit('update:integrationTools', on ? { ...rest, [id]: 'read' } : rest);
};

const handleIntegrationLevel = (
  id: CloudDriveIntegrationId,
  level: IntegrationToolAccessLevel,
) => {
  emit('update:integrationTools', { ...props.integrationTools, [id]: level });
};
</script>

<template>
  <div
    v-for="tool in availableTools"
    :key="tool.id"
    :data-invalid="props.invalid"
    class="flex flex-row items-center space-x-3"
  >
    <Checkbox
      :id="`form-rhf-checkbox-${tool.id}`"
      :name="tool.id"
      :model-value="selectedTools.includes(tool.id)"
      class="border-stone-600"
      @update:model-value="
        (checked) => handleCheckedChange(tool.id, Boolean(checked))
      "
    >
      <CheckIcon class="size-3.5" />
    </Checkbox>
    <Label
      :for="`form-rhf-checkbox-${tool.id}`"
      class="flex cursor-pointer space-x-3"
    >
      <div class="flex justify-center">
        <component :is="tool.icon" class="size-5 stroke-1.5" />
      </div>
      <div class="space-y-1">
        <p class="text-sm">{{ $t(tool.titleKey) }}</p>
        <p class="text-xs font-normal opacity-75">
          {{ $t(tool.descriptionKey) }}
        </p>
      </div>
    </Label>
  </div>

  <template v-for="id in cloudDriveIds" :key="id">
    <div class="flex flex-row items-center space-x-3">
      <Checkbox
        :id="`form-rhf-checkbox-${id}`"
        :name="id"
        :model-value="props.integrationTools[id] !== undefined"
        class="border-stone-600"
        @update:model-value="
          (checked) => handleIntegrationToggle(id, Boolean(checked))
        "
      >
        <CheckIcon class="size-3.5" />
      </Checkbox>
      <Label
        :for="`form-rhf-checkbox-${id}`"
        class="flex cursor-pointer space-x-3"
      >
        <div class="flex justify-center">
          <CloudIcon class="size-5 stroke-1.5" />
        </div>
        <div class="space-y-1">
          <p class="text-sm">{{ $t(`agent.tool.cloudDrive.${id}.label`) }}</p>
          <p class="text-xs font-normal opacity-75">
            {{ $t(`agent.tool.cloudDrive.${id}.description`) }}
          </p>
        </div>
      </Label>
    </div>
    <div
      v-if="props.integrationTools[id] !== undefined"
      class="ml-8 max-w-xs space-y-2 border-l pl-4"
    >
      <Label class="text-xs text-muted-foreground">
        {{ $t('agent.tool.cloudDrive.accessLevelLabel') }}
      </Label>
      <Select
        :model-value="props.integrationTools[id]"
        @update:model-value="
          (v) => handleIntegrationLevel(id, v === 'write' ? 'write' : 'read')
        "
      >
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="read">
            {{ $t('agent.tool.cloudDrive.accessLevel.read') }}
          </SelectItem>
          <SelectItem value="write">
            {{ $t('agent.tool.cloudDrive.accessLevel.write') }}
          </SelectItem>
        </SelectContent>
      </Select>
      <p
        v-if="connectionsData && !connectedIntegrationIds.has(id)"
        class="text-xs text-muted-foreground"
      >
        {{
          $t('agent.tool.cloudDrive.connectHint', {
            name: $t(`agent.tool.cloudDrive.${id}.label`),
          })
        }}.
        <NuxtLink :to="CONNECTIONS_PAGE_PATH" class="underline">
          {{ $t('agent.tool.cloudDrive.connectLink') }}
        </NuxtLink>
      </p>
    </div>
  </template>

  <div
    v-if="selectedTools.includes('datasets')"
    class="ml-8 max-w-xs space-y-2 border-l pl-4"
  >
    <Label class="text-xs text-muted-foreground">
      {{ $t('agent.tool.datasets.defaultDatasetLabel') }}
    </Label>
    <Select
      :model-value="defaultDatasetId ?? NO_DATASET"
      @update:model-value="
        (v) =>
          emit('update:defaultDatasetId', v === NO_DATASET ? null : String(v))
      "
    >
      <SelectTrigger class="w-full">
        <SelectValue
          :placeholder="$t('agent.tool.datasets.defaultDatasetPlaceholder')"
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="NO_DATASET">
          {{ $t('agent.tool.datasets.defaultDatasetNone') }}
        </SelectItem>
        <SelectItem
          v-for="dataset in pickerDatasets"
          :key="dataset.id"
          :value="dataset.id"
        >
          {{ dataset.name }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
