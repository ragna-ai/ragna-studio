<script setup lang="ts">
import { ChevronDownIcon, ImageIcon, UploadIcon, XIcon } from '@lucide/vue';
import { useForm } from '@tanstack/vue-form';
import { storeToRefs } from 'pinia';
import { z } from 'zod';
import AiModelSelector from '~/features/aimodel/components/AiModelSelector.vue';
import type { AiModelListItem } from '~/features/aimodel/composables/useAiModelList';
import { useGetAllAiModels } from '~/features/aimodel/composables/useAiModelList';
import {
  imageAspectRatios,
  imageResolutions,
  useGenerateImages,
  useUploadImageReference,
  type GeneratedImage,
  type ImageReferenceInput,
  type ReuseImageSettings,
} from '~/features/image/composables/useImageGenApi';
import { useImageGenSettingsStore } from '~/features/image/stores/imagegensettings.store';

interface Props {
  // Shared with ImageGenGrid via the /text-to-image page, so the workspace's
  // generated images are fetched once and both the grid and this form's
  // reference picker read the same list (docs/imagegen/prd.md).
  genImages: GeneratedImage[];
}

type ReferenceMode = 'genImage' | 'upload';

// Props
const props = defineProps<Props>();

// Composables
const { t } = useI18n();
const { data: aiModelData } = useGetAllAiModels();
const { mutate: generateImages, isPending } = useGenerateImages();
const { mutate: uploadReference, isPending: isUploadingReference } =
  useUploadImageReference();
const { modelId, aspectRatio, resolution, count, visibleWatermark } =
  storeToRefs(useImageGenSettingsStore());

// Refs
const referenceFileInputRef = useTemplateRef<HTMLInputElement>(
  'referenceFileInputRef',
);
const advancedOptionsOpen = ref(false);
const referenceImagesEnabled = ref(false);
const referenceMode = ref<ReferenceMode>('genImage');
const selectedGenImageIds = ref<string[]>([]);
const uploadedReferences = ref<{ storageKey: string; previewUrl: string }[]>(
  [],
);

const imageGenSchema = z.object({
  prompt: z.string().min(1, t('imagen.form.promptRequired')).max(5000),
  negativePrompt: z.string().max(5000),
  seed: z.number().int().nullable(),
});

const form = useForm({
  defaultValues: {
    prompt: '',
    negativePrompt: '',
    seed: null as number | null,
  },
  validators: { onChange: imageGenSchema },
  onSubmit: ({ value }) => {
    if (!selectedModel.value || isPending.value) return;

    generateImages(
      {
        prompt: value.prompt,
        aiModelId: selectedModel.value.id,
        aspectRatio: aspectRatio.value,
        resolution: resolution.value,
        n: count.value,
        negativePrompt: supportsNegativePrompt.value
          ? value.negativePrompt.trim() || undefined
          : undefined,
        seed: supportsSeed.value ? (value.seed ?? undefined) : undefined,
        referenceImages: resolveReferenceImages(),
        visibleWatermark: visibleWatermark.value,
      },
      { onSuccess: resetOptionalFields },
    );
  },
});

// Computed
const imageModels = computed<AiModelListItem[]>(
  () =>
    aiModelData.value?.models.filter(
      (model: AiModelListItem) => model.modality === 'image',
    ) ?? [],
);

const selectedModel = computed(() =>
  imageModels.value.find((model) => model.id === modelId.value),
);

// Only a completed row has a media object to condition on: the gallery
// picker below must exclude pending/processing/failed rows, since
// referencing one of those 404s server-side (apps/api's imagegen.service.ts
// resolveReferenceImage, docs/imagegen/worker-execution-prd.md decision 1).
const referenceableGenImages = computed(() =>
  props.genImages.filter((image) => image.status === 'completed'),
);

// Fail closed: an absent or falsy capability flag means the input is
// unavailable, never a fallback default (docs/imagegen/prd.md decision 1).
const supportsNegativePrompt = computed(
  () => selectedModel.value?.capabilities.supportsNegativePrompt ?? false,
);
const supportsSeed = computed(
  () => selectedModel.value?.capabilities.supportsSeed ?? false,
);
const supportsReferenceImages = computed(
  () => selectedModel.value?.capabilities.supportsReferenceImages ?? false,
);
const referenceCap = computed(() =>
  Math.min(selectedModel.value?.capabilities.maxReferenceImages ?? 0, 4),
);

const referenceCount = computed(
  () => selectedGenImageIds.value.length + uploadedReferences.value.length,
);
const isReferenceCapReached = computed(
  () => referenceCount.value >= referenceCap.value,
);

// Functions
function resolveReferenceImages(): ImageReferenceInput[] | undefined {
  if (!supportsReferenceImages.value || !referenceImagesEnabled.value) {
    return undefined;
  }

  // A model swap can lower the cap below what's already picked; slice
  // rather than block submission or silently clear the picker's state.
  const references: ImageReferenceInput[] = [
    ...selectedGenImageIds.value.map((genImageId) => ({
      origin: 'genImage' as const,
      genImageId,
    })),
    ...uploadedReferences.value.map(({ storageKey }) => ({
      origin: 'upload' as const,
      storageKey,
    })),
  ].slice(0, referenceCap.value);

  return references.length > 0 ? references : undefined;
}

function resetOptionalFields() {
  form.reset();
  referenceImagesEnabled.value = false;
  selectedGenImageIds.value = [];
  clearUploadedReferences();
}

function toggleGenImageReference(id: string) {
  const index = selectedGenImageIds.value.indexOf(id);
  if (index !== -1) {
    selectedGenImageIds.value.splice(index, 1);
    return;
  }
  if (isReferenceCapReached.value) return;
  selectedGenImageIds.value.push(id);
}

function openReferenceFilePicker() {
  referenceFileInputRef.value?.click();
}

function removeUploadedReference(index: number) {
  const [removed] = uploadedReferences.value.splice(index, 1);
  if (removed) URL.revokeObjectURL(removed.previewUrl);
}

function clearUploadedReferences() {
  for (const reference of uploadedReferences.value) {
    URL.revokeObjectURL(reference.previewUrl);
  }
  uploadedReferences.value = [];
}

function handleReferenceFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || isReferenceCapReached.value) return;

  uploadReference(file, {
    onSuccess: ({ storageKey }) => {
      uploadedReferences.value.push({
        storageKey,
        previewUrl: URL.createObjectURL(file),
      });
    },
  });
}

// Called by the /text-to-image page when the preview dialog's "Reuse
// settings" button fires. Re-selects the image's model when it still exists,
// then applies negativePrompt/seed only if the resulting model supports
// them, so a field the model can't honour is dropped rather than queued for
// submission (docs/imagegen/prd.md).
function applyReusedSettings(settings: ReuseImageSettings) {
  const matchedModel = imageModels.value.find(
    (model) =>
      model.provider === settings.provider && model.model === settings.model,
  );
  if (matchedModel) {
    modelId.value = matchedModel.id;
  }

  if (settings.aspectRatio) aspectRatio.value = settings.aspectRatio;
  if (settings.resolution) resolution.value = settings.resolution;
  visibleWatermark.value = settings.visibleWatermark;

  form.setFieldValue(
    'negativePrompt',
    supportsNegativePrompt.value ? (settings.negativePrompt ?? '') : '',
  );
  form.setFieldValue('seed', supportsSeed.value ? settings.seed : null);
}

defineExpose({ applyReusedSettings });

// Hooks
// Fall back to the first image model when none (or a removed one) is
// selected. Skip while the model list is still loading, so a persisted
// modelId isn't wiped out before the fetch resolves.
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
  <form
    class="space-y-4 rounded-xl border p-4 shadow"
    @submit.prevent.stop="form.handleSubmit"
  >
    <form.Field name="prompt">
      <template v-slot="{ field, state }">
        <div>
          <Textarea
            :id="field.name"
            rows="3"
            :placeholder="t('imagen.form.promptPlaceholder')"
            :model-value="state.value"
            autofocus
            @update:model-value="
              (v: string | number) => field.handleChange(String(v))
            "
            @blur="field.handleBlur"
            class="border-0 shadow-none"
          />
          <FormFieldInfo :state="state" />
        </div>
      </template>
    </form.Field>

    <div class="flex flex-wrap items-center gap-3">
      <div>
        <AiModelSelector
          v-model="modelId"
          modality="image"
          class="border-0 shadow-none"
        />
      </div>

      <Select v-model="aspectRatio">
        <SelectTrigger class="w-28 border-0 shadow-none">
          <SelectValue :placeholder="t('imagen.form.aspectRatio')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="ratio in imageAspectRatios"
            :key="ratio"
            :value="ratio"
          >
            {{ ratio }}
          </SelectItem>
        </SelectContent>
      </Select>

      <Select v-model="resolution">
        <SelectTrigger class="w-24 border-0 shadow-none">
          <SelectValue :placeholder="t('imagen.form.resolution')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="res in imageResolutions" :key="res" :value="res">
            {{ res }}
          </SelectItem>
        </SelectContent>
      </Select>

      <Select v-model="count">
        <SelectTrigger class="w-36 border-0 shadow-none">
          <SelectValue :placeholder="t('imagen.form.count')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="n in 4" :key="n" :value="n">
            {{ n }}
            {{
              n === 1
                ? t('imagen.form.countSingular')
                : t('imagen.form.countPlural')
            }}
          </SelectItem>
        </SelectContent>
      </Select>

      <div class="flex items-center gap-2">
        <Switch id="visible-watermark" v-model="visibleWatermark" />
        <Label for="visible-watermark" class="text-sm">
          {{ t('imagen.form.visibleWatermark') }}
        </Label>
      </div>
    </div>

    <Collapsible v-model:open="advancedOptionsOpen">
      <CollapsibleTrigger
        class="group/advanced ml-3 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        {{ t('imagen.form.advancedOptions') }}
        <ChevronDownIcon
          class="size-4 transition-transform group-data-[state=open]/advanced:rotate-180"
        />
      </CollapsibleTrigger>

      <CollapsibleContent class="space-y-4 p-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <div>
                <form.Field name="negativePrompt">
                  <template v-slot="{ field, state }">
                    <div>
                      <Label
                        class="mb-2 block text-sm font-medium"
                        :for="field.name"
                      >
                        {{ t('imagen.form.negativePrompt') }}
                      </Label>
                      <Textarea
                        :id="field.name"
                        rows="2"
                        :disabled="!supportsNegativePrompt"
                        :placeholder="
                          t('imagen.form.negativePromptPlaceholder')
                        "
                        :model-value="state.value"
                        @update:model-value="
                          (v: string | number) => field.handleChange(String(v))
                        "
                        @blur="field.handleBlur"
                        class="shadow-none"
                      />
                      <FormFieldInfo :state="state" />
                    </div>
                  </template>
                </form.Field>
              </div>
            </TooltipTrigger>
            <TooltipContent v-if="!supportsNegativePrompt">
              {{
                t('imagen.form.negativePromptUnsupported', {
                  model: selectedModel?.displayName ?? '',
                })
              }}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger as-child>
              <div class="max-w-40">
                <form.Field name="seed">
                  <template v-slot="{ field, state }">
                    <div>
                      <Label
                        class="mb-2 block text-sm font-medium"
                        :for="field.name"
                      >
                        {{ t('imagen.form.seed') }}
                      </Label>
                      <Input
                        :id="field.name"
                        type="number"
                        :disabled="!supportsSeed"
                        :model-value="state.value ?? ''"
                        @update:model-value="
                          (v: string | number) =>
                            field.handleChange(v === '' ? null : Number(v))
                        "
                        @blur="field.handleBlur"
                        class="shadow-none"
                      />
                      <FormFieldInfo :state="state" />
                    </div>
                  </template>
                </form.Field>
              </div>
            </TooltipTrigger>
            <TooltipContent v-if="!supportsSeed">
              {{
                t('imagen.form.seedUnsupported', {
                  model: selectedModel?.displayName ?? '',
                })
              }}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CollapsibleContent>
    </Collapsible>

    <div v-if="supportsReferenceImages" class="space-y-3 border-t pt-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Switch
            id="reference-images-enabled"
            v-model="referenceImagesEnabled"
          />
          <Label for="reference-images-enabled" class="text-sm">
            {{ t('imagen.form.referenceImages') }}
          </Label>
        </div>
        <span v-if="referenceImagesEnabled" class="text-xs text-muted-foreground">
          {{
            t('imagen.form.referenceImagesCount', {
              count: referenceCount,
              max: referenceCap,
            })
          }}
        </span>
      </div>

      <Tabs v-if="referenceImagesEnabled" v-model="referenceMode">
        <TabsList>
          <TabsTrigger value="genImage">
            {{ t('imagen.form.referenceImagesFromGallery') }}
          </TabsTrigger>
          <TabsTrigger value="upload">
            {{ t('imagen.form.referenceImagesUpload') }}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="genImage">
          <p
            v-if="referenceableGenImages.length === 0"
            class="text-sm text-muted-foreground"
          >
            {{ t('imagen.form.referenceImagesGalleryEmpty') }}
          </p>
          <div v-else class="flex flex-wrap gap-2">
            <button
              v-for="image in referenceableGenImages"
              :key="image.id"
              type="button"
              class="size-16 shrink-0 overflow-hidden rounded-md border-2 disabled:opacity-40"
              :class="
                selectedGenImageIds.includes(image.id)
                  ? 'border-primary'
                  : 'border-transparent'
              "
              :disabled="
                !selectedGenImageIds.includes(image.id) && isReferenceCapReached
              "
              @click="toggleGenImageReference(image.id)"
            >
              <img
                :src="image.imgUrl"
                :alt="image.prompt"
                class="size-full object-cover"
              />
            </button>
          </div>
        </TabsContent>

        <TabsContent value="upload">
          <input
            ref="referenceFileInputRef"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="hidden"
            @change="handleReferenceFileChange"
          />
          <div
            v-if="uploadedReferences.length > 0"
            class="mb-3 flex flex-wrap gap-3"
          >
            <div
              v-for="(reference, index) in uploadedReferences"
              :key="reference.storageKey"
              class="relative"
            >
              <img
                :src="reference.previewUrl"
                alt=""
                class="size-16 rounded-md border object-cover"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                class="absolute -top-2 -right-2"
                @click="removeUploadedReference(index)"
              >
                <XIcon class="size-3.5" />
              </Button>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            :disabled="isUploadingReference || isReferenceCapReached"
            @click="openReferenceFilePicker"
          >
            <Spinner v-if="isUploadingReference" class="mr-2" />
            <UploadIcon v-else class="mr-2 size-4" />
            {{ t('imagen.form.referenceImagesUploadButton') }}
          </Button>
        </TabsContent>
      </Tabs>
    </div>

    <div class="flex justify-end">
      <Button type="submit" :disabled="isPending || !selectedModel">
        <Spinner v-if="isPending" class="mr-2" />
        <ImageIcon v-else class="mr-2 size-4" />
        {{ t('imagen.form.submit') }}
      </Button>
    </div>
  </form>
</template>
