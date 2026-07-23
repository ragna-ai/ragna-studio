<script setup lang="ts">
import { UploadIcon, VideoIcon, XIcon } from '@lucide/vue';
import { useForm } from '@tanstack/vue-form';
import { storeToRefs } from 'pinia';
import { z } from 'zod';
import AiModelSelector from '~/features/aimodel/components/AiModelSelector.vue';
import { useGetAllAiModels } from '~/features/aimodel/composables/useAiModelList';
import { useGetGenImages } from '~/features/image/composables/useImageGenApi';
import {
  getSupportedResolutions,
  useGenerateVideo,
  useUploadVideoFrame,
  videoGenAspectRatios,
  videoGenDurations,
  videoGenResolutions,
} from '~/features/video/composables/useVideoGenApi';
import { useVideoGenSettingsStore } from '~/features/video/stores/videogensettings.store';

interface VideoModel {
  id: string;
  provider: string;
  model: string;
  displayName: string;
  modality: string;
}

type FrameMode = 'genImage' | 'upload';

// Composables
const { t } = useI18n();
const { data: aiModelData } = useGetAllAiModels();
const { data: genImageData } = useGetGenImages({ limit: 100 });
const { mutate: generateVideo, isPending } = useGenerateVideo();
const { mutate: uploadFrame, isPending: isUploadingFrame } =
  useUploadVideoFrame();
const { modelId, aspectRatio, resolution, duration, generateAudio } =
  storeToRefs(useVideoGenSettingsStore());

// Refs
const fileInputRef = useTemplateRef<HTMLInputElement>('fileInputRef');
const frameEnabled = ref(false);
const frameMode = ref<FrameMode>('genImage');
const selectedGenImageId = ref<string | null>(null);
const uploadedFrame = ref<{ storageKey: string; previewUrl: string } | null>(
  null,
);

const videoGenSchema = z.object({
  prompt: z.string().min(1, t('videogen.form.promptRequired')).max(5000),
  negativePrompt: z.string().max(5000),
  seed: z.number().int().nullable(),
});

const form = useForm({
  defaultValues: {
    prompt: '',
    negativePrompt: '',
    seed: null as number | null,
  },
  validators: { onChange: videoGenSchema },
  onSubmit: ({ value }) => {
    if (!selectedModel.value || isPending.value) return;

    generateVideo(
      {
        prompt: value.prompt,
        model: selectedModel.value.model,
        provider: selectedModel.value.provider,
        aspectRatio: aspectRatio.value,
        resolution: resolution.value,
        duration: duration.value,
        generateAudio: generateAudio.value,
        negativePrompt: value.negativePrompt.trim() || undefined,
        seed: value.seed ?? undefined,
        frame: resolveFrame(),
      },
      { onSuccess: resetOptionalFields },
    );
  },
});

// Computed
const videoModels = computed<VideoModel[]>(
  () =>
    aiModelData.value?.models.filter(
      (model: VideoModel) => model.modality === 'video',
    ) ?? [],
);

const selectedModel = computed(() =>
  videoModels.value.find((model) => model.id === modelId.value),
);

const availableResolutions = computed(() =>
  getSupportedResolutions(aspectRatio.value),
);

const genImages = computed(() => genImageData.value?.genImages ?? []);

// Functions
function resolveFrame() {
  if (!frameEnabled.value) return undefined;
  if (frameMode.value === 'genImage' && selectedGenImageId.value) {
    return { origin: 'genImage' as const, genImageId: selectedGenImageId.value };
  }
  if (frameMode.value === 'upload' && uploadedFrame.value) {
    return {
      origin: 'upload' as const,
      storageKey: uploadedFrame.value.storageKey,
    };
  }
  return undefined;
}

function resetOptionalFields() {
  form.reset();
  frameEnabled.value = false;
  selectedGenImageId.value = null;
  clearUploadedFrame();
}

function selectGenImage(id: string) {
  selectedGenImageId.value = selectedGenImageId.value === id ? null : id;
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function clearUploadedFrame() {
  if (uploadedFrame.value) {
    URL.revokeObjectURL(uploadedFrame.value.previewUrl);
  }
  uploadedFrame.value = null;
}

function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  uploadFrame(file, {
    onSuccess: ({ storageKey }) => {
      clearUploadedFrame();
      uploadedFrame.value = { storageKey, previewUrl: URL.createObjectURL(file) };
    },
  });
}

// Hooks
// Fall back to the first video model when none (or a removed one) is
// selected. Skip while the model list is still loading, so a persisted
// modelId isn't wiped out before the fetch resolves.
watch(
  videoModels,
  (models) => {
    if (models.length === 0) return;
    if (models.some((model) => model.id === modelId.value)) return;
    modelId.value = models[0]?.id ?? '';
  },
  { immediate: true },
);

// 1080p only exists for 16:9 (docs/videogen/prd.md); clamp a persisted or
// user-picked combination that's no longer valid.
watch(
  [aspectRatio, availableResolutions],
  ([, supported]) => {
    if (!supported.includes(resolution.value)) {
      resolution.value = supported[0] ?? '720p';
    }
  },
  { immediate: true },
);
</script>

<template>
  <form
    class="space-y-4 rounded-xl border p-4"
    @submit.prevent.stop="form.handleSubmit"
  >
    <form.Field name="prompt">
      <template v-slot="{ field, state }">
        <div>
          <Textarea
            :id="field.name"
            rows="3"
            :placeholder="t('videogen.form.promptPlaceholder')"
            :model-value="state.value"
            autofocus
            @update:model-value="
              (v: string | number) => field.handleChange(String(v))
            "
            @blur="field.handleBlur"
          />
          <FormFieldInfo :state="state" />
        </div>
      </template>
    </form.Field>

    <div class="flex flex-wrap items-center gap-3">
      <div class="w-48">
        <AiModelSelector v-model="modelId" modality="video" />
      </div>

      <Select v-model="aspectRatio">
        <SelectTrigger class="w-32">
          <SelectValue :placeholder="t('videogen.form.aspectRatio')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="ratio in videoGenAspectRatios"
            :key="ratio"
            :value="ratio"
          >
            {{ ratio }}
          </SelectItem>
        </SelectContent>
      </Select>

      <Select v-model="resolution">
        <SelectTrigger class="w-28">
          <SelectValue :placeholder="t('videogen.form.resolution')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="res in videoGenResolutions"
            :key="res"
            :value="res"
            :disabled="!availableResolutions.includes(res)"
          >
            {{ res }}
          </SelectItem>
        </SelectContent>
      </Select>

      <Select v-model="duration">
        <SelectTrigger class="w-24">
          <SelectValue :placeholder="t('videogen.form.duration')" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="seconds in videoGenDurations"
            :key="seconds"
            :value="seconds"
          >
            {{ t('videogen.form.durationSeconds', { seconds }) }}
          </SelectItem>
        </SelectContent>
      </Select>

      <div class="flex items-center gap-2">
        <Switch id="generate-audio" v-model="generateAudio" />
        <Label for="generate-audio" class="text-sm">
          {{ t('videogen.form.generateAudio') }}
        </Label>
      </div>
    </div>

    <form.Field name="negativePrompt">
      <template v-slot="{ field, state }">
        <div>
          <Label class="mb-2 block text-sm font-medium" :for="field.name">
            {{ t('videogen.form.negativePrompt') }}
          </Label>
          <Textarea
            :id="field.name"
            rows="2"
            :placeholder="t('videogen.form.negativePromptPlaceholder')"
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

    <form.Field name="seed">
      <template v-slot="{ field, state }">
        <div class="max-w-40">
          <Label class="mb-2 block text-sm font-medium" :for="field.name">
            {{ t('videogen.form.seed') }}
          </Label>
          <Input
            :id="field.name"
            type="number"
            :model-value="state.value ?? ''"
            @update:model-value="
              (v: string | number) =>
                field.handleChange(v === '' ? null : Number(v))
            "
            @blur="field.handleBlur"
          />
          <FormFieldInfo :state="state" />
        </div>
      </template>
    </form.Field>

    <div class="space-y-3 border-t pt-4">
      <div class="flex items-center gap-2">
        <Switch id="frame-enabled" v-model="frameEnabled" />
        <Label for="frame-enabled" class="text-sm">
          {{ t('videogen.form.animateImage') }}
        </Label>
      </div>

      <div v-if="frameEnabled" class="space-y-3">
        <Tabs v-model="frameMode">
          <TabsList>
            <TabsTrigger value="genImage">
              {{ t('videogen.form.frameFromGallery') }}
            </TabsTrigger>
            <TabsTrigger value="upload">
              {{ t('videogen.form.frameUpload') }}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="genImage">
            <p
              v-if="genImages.length === 0"
              class="text-sm text-muted-foreground"
            >
              {{ t('videogen.form.frameGalleryEmpty') }}
            </p>
            <div v-else class="flex flex-wrap gap-2">
              <button
                v-for="image in genImages"
                :key="image.id"
                type="button"
                class="size-16 shrink-0 overflow-hidden rounded-md border-2"
                :class="
                  selectedGenImageId === image.id
                    ? 'border-primary'
                    : 'border-transparent'
                "
                @click="selectGenImage(image.id)"
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
              ref="fileInputRef"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              class="hidden"
              @change="handleFileChange"
            />
            <div v-if="uploadedFrame" class="flex items-center gap-3">
              <img
                :src="uploadedFrame.previewUrl"
                alt=""
                class="size-16 rounded-md border object-cover"
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                @click="clearUploadedFrame"
              >
                <XIcon class="size-3.5" />
              </Button>
            </div>
            <Button
              v-else
              type="button"
              variant="outline"
              :disabled="isUploadingFrame"
              @click="openFilePicker"
            >
              <Spinner v-if="isUploadingFrame" class="mr-2" />
              <UploadIcon v-else class="mr-2 size-4" />
              {{ t('videogen.form.frameUploadButton') }}
            </Button>
          </TabsContent>
        </Tabs>
      </div>
    </div>

    <div class="flex justify-end">
      <Button type="submit" :disabled="isPending || !selectedModel">
        <Spinner v-if="isPending" class="mr-2" />
        <VideoIcon v-else class="mr-2 size-4" />
        {{ t('videogen.form.submit') }}
      </Button>
    </div>
  </form>
</template>
