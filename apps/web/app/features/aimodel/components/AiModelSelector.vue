<script setup lang="ts">
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
}

// Props
const props = withDefaults(defineProps<Props>(), {
  modality: 'text',
});

const modelValue = defineModel<string>();

// Composables
const { data, isLoading, isError } = useGetAllAiModels();

// Computed
const models = computed<AiModelOption[]>(
  () =>
    data.value?.models.filter(
      (model: AiModelOption) => model.modality === props.modality,
    ) ?? [],
);
</script>

<template>
  <div>
    <p v-if="isLoading" class="text-sm text-muted-foreground">
      Loading AI models...
    </p>
    <p v-else-if="isError" class="text-sm text-destructive">
      Error loading AI models.
    </p>
    <Select v-else v-model="modelValue">
      <SelectTrigger>
        <SelectValue placeholder="Select an AI model" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="model in models" :key="model.id" :value="model.id">
          {{ firstToUpperCase(model.provider) }} - {{ model.displayName }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
