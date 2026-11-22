<script setup lang="ts">
import { EditorContent } from '@repo/editor';
import { cn } from '~/lib/utils';
import type { RichTextEditorController } from './types';

// Props
const props = defineProps<{
  controller: RichTextEditorController;
  /** Hides the editing menus. */
  readonly?: boolean;
  class?: string;
}>();

// Refs
const editor = props.controller.editor;

// Functions
function focusEditorEnd() {
  props.controller.focusEnd();
}
</script>

<template>
  <div
    :class="cn('document-sheet cursor-text', props.class)"
    @mousedown.self.prevent="focusEditorEnd"
  >
    <EditorContent :editor="editor" class="flex flex-1 flex-col" />
    <template v-if="!readonly">
      <EditorBubbleMenu :controller="controller" />
      <EditorTableMenu :controller="controller" />
      <EditorSlashMenu :controller="controller" />
    </template>
  </div>
</template>

<style src="./RichTextEditor.css"></style>
