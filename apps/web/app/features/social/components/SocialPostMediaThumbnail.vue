<script setup lang="ts">
// Imports
import { PencilIcon, XIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { Label } from '~/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import { Spinner } from '~/components/ui/spinner';
import { Textarea } from '~/components/ui/textarea';
import type { SocialPostMedia } from '~/features/social/composables/useSocialPostApi';

// Props
const props = defineProps<{
  media: SocialPostMedia;
  editable: boolean;
  isDeleting: boolean;
}>();

// Emits
const emit = defineEmits<{
  delete: [mediaId: string];
  saveAltText: [mediaId: string, altText: string];
}>();

// Refs
const altTextDraft = ref(props.media.altText ?? '');

// Composables
const { t } = useI18n();

// Computed

// Functions
function saveAltTextIfChanged() {
  const nextAltText = altTextDraft.value.trim();
  if (nextAltText !== (props.media.altText ?? '')) {
    emit('saveAltText', props.media.id, nextAltText);
  }
}

// Hooks
watch(
  () => props.media.altText,
  (altText) => {
    altTextDraft.value = altText ?? '';
  },
);
</script>

<template>
  <div
    class="group relative size-20 shrink-0 overflow-hidden rounded-md border"
  >
    <img
      :src="media.imageUrl"
      :alt="media.altText || ''"
      loading="lazy"
      class="size-full object-cover"
    />

    <div
      v-if="editable"
      class="absolute inset-0 flex items-start justify-between gap-1 bg-black/0 p-1 opacity-0 transition-opacity group-hover:bg-black/40 group-hover:opacity-100"
    >
      <Popover>
        <PopoverTrigger as-child>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            class="size-6"
            :title="t('social.media.editAltText')"
          >
            <PencilIcon class="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-64 space-y-2" align="start">
          <Label :for="`social-media-alt-text-${media.id}`">
            {{ t('social.media.altTextLabel') }}
          </Label>
          <Textarea
            :id="`social-media-alt-text-${media.id}`"
            v-model="altTextDraft"
            rows="3"
            maxlength="4086"
            @blur="saveAltTextIfChanged"
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        size="icon"
        variant="destructive"
        class="size-6"
        :disabled="isDeleting"
        :title="t('social.media.remove')"
        @click="emit('delete', media.id)"
      >
        <XIcon class="size-3" />
      </Button>
    </div>

    <div
      v-if="isDeleting"
      class="absolute inset-0 flex items-center justify-center bg-black/40"
    >
      <Spinner class="size-5 text-white" />
    </div>
  </div>
</template>
