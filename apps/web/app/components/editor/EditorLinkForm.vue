<script setup lang="ts">
import type { RichTextEditorController } from './types';

// Props
const props = defineProps<{ controller: RichTextEditorController }>();

// Emits
const emit = defineEmits<{ done: [] }>();

// Refs
const linkUrl = ref(props.controller.getLink());
const isOnLink = ref(linkUrl.value !== '');

// Composables
const { t } = useI18n();

// Functions
function submitLink() {
  const url = linkUrl.value.trim();
  if (url) {
    props.controller.setLink(url);
  } else {
    props.controller.unsetLink();
  }
  emit('done');
}

function removeLink() {
  props.controller.unsetLink();
  emit('done');
}
</script>

<template>
  <form class="flex items-center gap-2" @submit.prevent="submitLink">
    <Input
      v-model="linkUrl"
      type="url"
      autofocus
      :placeholder="t('editor.link.placeholder')"
      :aria-label="t('editor.link.label')"
    />
    <Button type="submit" size="sm">
      {{ t('editor.link.apply') }}
    </Button>
    <Button
      v-if="isOnLink"
      type="button"
      variant="ghost"
      size="sm"
      @click="removeLink"
    >
      {{ t('editor.link.remove') }}
    </Button>
  </form>
</template>
