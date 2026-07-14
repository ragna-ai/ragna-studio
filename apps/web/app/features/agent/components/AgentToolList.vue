<script setup lang="ts">
import {
  AppWindowIcon,
  CheckIcon,
  GlobeIcon,
  ImageIcon,
  PencilLineIcon,
  Share2Icon,
  type LucideIcon,
} from '@lucide/vue';

type AgentToolListProps = {
  modelValue: string[];
  invalid?: boolean;
};

type AgentToolListEmit = {
  'update:modelValue': [value: string[]];
};

// Imports
const props = withDefaults(defineProps<AgentToolListProps>(), {
  invalid: false,
});

const emit = defineEmits<AgentToolListEmit>();

// Props
// Emits

// Refs

// Composables

// Computed
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
    titleKey: 'agent.tools.think.title',
    descriptionKey: 'agent.tools.think.description',
  },
  {
    id: 'webSearch',
    icon: GlobeIcon,
    titleKey: 'agent.tools.webSearch.title',
    descriptionKey: 'agent.tools.webSearch.description',
  },
  {
    id: 'webBrowser',
    icon: AppWindowIcon,
    titleKey: 'agent.tools.webBrowser.title',
    descriptionKey: 'agent.tools.webBrowser.description',
  },
  {
    id: 'imageGen',
    icon: ImageIcon,
    titleKey: 'agent.tools.imageGen.title',
    descriptionKey: 'agent.tools.imageGen.description',
  },
  {
    id: 'linkedinDraft',
    icon: Share2Icon,
    titleKey: 'agent.tools.linkedinDraft.title',
    descriptionKey: 'agent.tools.linkedinDraft.description',
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
</template>
