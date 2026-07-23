<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { useGetAllAiModels } from '~/features/aimodel/composables/useAiModelList';
import { firstToUpperCase } from '~/lib/utils';

interface AiModelOption {
  id: string;
  provider: string;
  model: string;
  modality: string;
  displayName: string;
}

interface Props {
  /** Only models with this modality are listed. */
  modality?: string;
  class?: HTMLAttributes['class'];
}

// Props
const props = withDefaults(defineProps<Props>(), {
  modality: 'text',
});

const modelValue = defineModel<string>();

// Composables
const { data, isError } = useGetAllAiModels();

// Computed
const models = computed<AiModelOption[]>(
  () =>
    data.value?.models.filter(
      (model: AiModelOption) => model.modality === props.modality,
    ) ?? [],
);

const normalizeModelProvider = (provider: string) => {
  const split = provider.split('-')[0];
  return firstToUpperCase(split ? split : provider);
};
</script>

<template>
  <div>
    <p v-if="isError" class="text-sm text-destructive">
      Error loading AI models.
    </p>
    <Select v-else v-model="modelValue">
      <SelectTrigger :class="props.class">
        <SelectValue placeholder="Select an AI model" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="model in models" :key="model.id" :value="model.id">
          {{ normalizeModelProvider(model.provider) }} -
          {{ model.displayName }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
