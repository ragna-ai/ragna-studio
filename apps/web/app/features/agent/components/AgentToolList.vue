<script setup lang="ts">
import {
  AppWindowIcon,
  CheckIcon,
  DatabaseIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  NotebookPenIcon,
  PencilLineIcon,
  Share2Icon,
  type LucideIcon,
} from '@lucide/vue';
import { useGetAllDatasetsForPicker } from '~/features/dataset/composables/useDatasetApi';

type AgentToolListProps = {
  modelValue: string[];
  invalid?: boolean;
  // The active workspace, used to scope the "Default dataset" picker the
  // same way the datasets tool's workspace filter works at runtime
  // (docs/datasets.md decision 10/11). An agent always lives in exactly one
  // workspace (docs/api-standards/prd.md), so this is never null.
  workspaceId: string;
  defaultDatasetId?: string | null;
};

type AgentToolListEmit = {
  'update:modelValue': [value: string[]];
  'update:defaultDatasetId': [value: string | null];
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
});

const emit = defineEmits<AgentToolListEmit>();

// Props
// Emits

// Refs

// Composables
// A stable computed ref, not a plain getter: vue-query unwraps refs inside
// query keys reactively, but a freshly created arrow function would compare
// unequal on every render and defeat caching.
const pickerWorkspaceId = computed(() => props.workspaceId);
const { data: datasetsData } = useGetAllDatasetsForPicker(pickerWorkspaceId);

// Computed
const pickerDatasets = computed(() => datasetsData.value?.datasets ?? []);
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
    icon: PencilLineIcon,
    titleKey: 'agent.tool.think.label',
    descriptionKey: 'agent.tool.think.description',
  },
  {
    id: 'memory',
    icon: NotebookPenIcon,
    titleKey: 'agent.tool.memory.label',
    descriptionKey: 'agent.tool.memory.description',
  },
  {
    id: 'webSearch',
    icon: GlobeIcon,
    titleKey: 'agent.tool.webSearch.label',
    descriptionKey: 'agent.tool.webSearch.description',
  },
  {
    id: 'webBrowser',
    icon: AppWindowIcon,
    titleKey: 'agent.tool.webBrowser.label',
    descriptionKey: 'agent.tool.webBrowser.description',
  },
  {
    id: 'imageGen',
    icon: ImageIcon,
    titleKey: 'agent.tool.imageGen.label',
    descriptionKey: 'agent.tool.imageGen.description',
  },
  {
    id: 'linkedinDraft',
    icon: Share2Icon,
    titleKey: 'agent.tool.linkedinDraft.label',
    descriptionKey: 'agent.tool.linkedinDraft.description',
  },
  {
    id: 'datasets',
    icon: DatabaseIcon,
    titleKey: 'agent.tool.datasets.label',
    descriptionKey: 'agent.tool.datasets.description',
  },
  {
    id: 'documents',
    icon: FileTextIcon,
    titleKey: 'agent.tool.documents.label',
    descriptionKey: 'agent.tool.documents.description',
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
        <p class="text-xs opacity-75">{{ $t(tool.descriptionKey) }}</p>
      </div>
    </Label>
  </div>

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
        (v) => emit('update:defaultDatasetId', v === NO_DATASET ? null : String(v))
      "
    >
      <SelectTrigger class="w-full">
        <SelectValue :placeholder="$t('agent.tool.datasets.defaultDatasetPlaceholder')" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="NO_DATASET">
          {{ $t('agent.tool.datasets.defaultDatasetNone') }}
        </SelectItem>
        <SelectItem v-for="dataset in pickerDatasets" :key="dataset.id" :value="dataset.id">
          {{ dataset.name }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
