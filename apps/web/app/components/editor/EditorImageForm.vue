<script setup lang="ts">
import type { RichTextEditorController } from './types';

// Props
const props = defineProps<{ controller: RichTextEditorController }>();

// Emits
const emit = defineEmits<{ done: [] }>();

// Refs
const imageUrl = ref('');

// Composables
const { t } = useI18n();

// Functions
function submitImage() {
  const url = imageUrl.value.trim();
  if (url) {
    props.controller.insertImage(url);
  }
  emit('done');
}
</script>

<template>
  <form class="flex items-center gap-2" @submit.prevent="submitImage">
    <Input
      v-model="imageUrl"
      type="url"
      autofocus
      :placeholder="t('editor.image.placeholder')"
      :aria-label="t('editor.image.label')"
    />
    <Button type="submit" size="sm">
      {{ t('editor.image.insert') }}
    </Button>
  </form>
</template>
