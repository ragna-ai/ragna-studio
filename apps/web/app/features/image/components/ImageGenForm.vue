<script setup lang="ts">
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import type { ChatStatus } from 'ai';
import { storeToRefs } from 'pinia';
import { useGetAllAiModels } from '~/features/aimodel/composables/useAiModelList';
import {
  imageAspectRatios,
  imageResolutions,
  useGenerateImages,
} from '~/features/image/composables/useImageGenApi';
import { useImageGenSettingsStore } from '~/features/image/stores/imagegensettings.store';

interface ImageModel {
  id: string;
  provider: string;
  model: string;
  displayName: string;
  modality: string;
}

// Composables
const { data: aiModelData } = useGetAllAiModels();
const { mutate: generateImages, isPending } = useGenerateImages();
const { modelId, aspectRatio, resolution, count } = storeToRefs(
  useImageGenSettingsStore(),
);

// Computed
const imageModels = computed<ImageModel[]>(
  () =>
    aiModelData.value?.models.filter(
      (model: ImageModel) => model.modality === 'image',
    ) ?? [],
);

const selectedModel = computed(() =>
  imageModels.value.find((model) => model.id === modelId.value),
);

const submitStatus = computed<ChatStatus>(() =>
  isPending.value ? 'submitted' : 'ready',
);

// Functions
function handleSubmit(message: PromptInputMessage) {
  const prompt = message.text.trim();
  const model = selectedModel.value;
  if (!prompt || !model || isPending.value) return;

  // Errors surface via the mutation's toast.
  generateImages({
    prompt,
    provider: model.provider,
    model: model.model,
    aspectRatio: aspectRatio.value,
    resolution: resolution.value,
    n: count.value,
  });
}

// Hooks
// Fall back to the first image model when none (or a removed one) is selected.
// Skip while the model list is still loading, so a persisted modelId isn't
// wiped out before the fetch resolves.
watch(
  imageModels,
  (models) => {
    if (models.length === 0) return;
    if (models.some((model) => model.id === modelId.value)) return;
    modelId.value = models[0]?.id ?? '';
  },
  { immediate: true },
);
</script>

<template>
  <PromptInput @submit="handleSubmit">
    <PromptInputBody>
      <PromptInputTextarea
        class="p-6"
        :placeholder="$t('imagen.input.placeholder')"
        autofocus
      />
    </PromptInputBody>
    <PromptInputFooter>
      <PromptInputTools>
        <PromptInputSelect v-model="modelId">
          <PromptInputSelectTrigger>
            <PromptInputSelectValue :placeholder="$t('imagen.model.title')" />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            <PromptInputSelectItem
              v-for="model in imageModels"
              :key="model.id"
              :value="model.id"
            >
              {{ model.displayName }}
            </PromptInputSelectItem>
          </PromptInputSelectContent>
        </PromptInputSelect>

        <PromptInputSelect v-model="aspectRatio">
          <PromptInputSelectTrigger>
            <PromptInputSelectValue
              :placeholder="$t('imagen.aspectRatio.title')"
            />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            <PromptInputSelectItem
              v-for="ratio in imageAspectRatios"
              :key="ratio"
              :value="ratio"
            >
              {{ ratio }}
            </PromptInputSelectItem>
          </PromptInputSelectContent>
        </PromptInputSelect>

        <PromptInputSelect v-model="resolution">
          <PromptInputSelectTrigger>
            <PromptInputSelectValue
              :placeholder="$t('imagen.resolution.title')"
            />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            <PromptInputSelectItem
              v-for="res in imageResolutions"
              :key="res"
              :value="res"
            >
              {{ res }}
            </PromptInputSelectItem>
          </PromptInputSelectContent>
        </PromptInputSelect>

        <PromptInputSelect v-model="count">
          <PromptInputSelectTrigger>
            <PromptInputSelectValue :placeholder="$t('imagen.count.title')" />
          </PromptInputSelectTrigger>
          <PromptInputSelectContent>
            <PromptInputSelectItem v-for="n in 4" :key="n" :value="n">
              {{ n }}
              {{
                n === 1
                  ? $t('imagen.count.singular')
                  : $t('imagen.count.plural')
              }}
            </PromptInputSelectItem>
          </PromptInputSelectContent>
        </PromptInputSelect>
      </PromptInputTools>

      <PromptInputSubmit :status="submitStatus" :disabled="isPending" />
    </PromptInputFooter>
  </PromptInput>
</template>
