<script setup lang="ts">
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignRightIcon,
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  HighlighterIcon,
  ItalicIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  Redo2Icon,
  StrikethroughIcon,
  TextIcon,
  UnderlineIcon,
  Undo2Icon,
} from '@lucide/vue';
import type { DocumentEditorController } from '~/features/document/composables/useDocumentEditor';
import { cn } from '~/lib/utils';

// Props
const props = defineProps<{
  controller: DocumentEditorController;
  class?: string;
}>();

// Composables
const { t } = useI18n();

// Refs
const editor = props.controller.editor;
</script>

<template>
  <div
    v-if="editor"
    :class="cn('relative flex justify-between px-4 py-3', props.class)"
  >
    <div class="flex space-x-1">
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.heading1')"
        :class="{
          'is-active-button': editor.isActive('heading', { level: 1 }),
        }"
        @click="() => controller.formatText('h1')"
      >
        <Heading1Icon class="size-5! bg-transparent stroke-1.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.heading2')"
        :class="{
          'is-active-button': editor.isActive('heading', { level: 2 }),
        }"
        @click="() => controller.formatText('h2')"
      >
        <Heading2Icon class="size-5! bg-transparent stroke-1.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.bold')"
        :class="{ 'is-active-button': editor.isActive('bold') }"
        @click="() => controller.formatText('bold')"
      >
        <BoldIcon class="size-4! bg-transparent" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.italic')"
        :class="{ 'is-active-button': editor.isActive('italic') }"
        @click="() => controller.formatText('italic')"
      >
        <ItalicIcon class="size-4! bg-transparent" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.underline')"
        :class="{ 'is-active-button': editor.isActive('underline') }"
        @click="() => controller.formatText('underline')"
      >
        <UnderlineIcon class="size-4! bg-transparent" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.strike')"
        :class="{ 'is-active-button': editor.isActive('strike') }"
        @click="() => controller.formatText('strike')"
      >
        <StrikethroughIcon class="size-4! bg-transparent" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.align')"
        @click="() => controller.cycleTextOrientation()"
      >
        <TextIcon
          v-if="editor.isActive({ textAlign: 'left' })"
          class="size-5! bg-transparent stroke-1.5"
        />
        <AlignCenterIcon
          v-else-if="editor.isActive({ textAlign: 'center' })"
          class="size-5! bg-transparent stroke-1.5"
        />
        <AlignRightIcon
          v-else-if="editor.isActive({ textAlign: 'right' })"
          class="size-5! bg-transparent stroke-1.5"
        />
        <AlignJustifyIcon
          v-else-if="editor.isActive({ textAlign: 'justify' })"
          class="size-5! bg-transparent stroke-1.5"
        />
        <TextIcon v-else class="size-5! bg-transparent stroke-1.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.list')"
        :class="{
          'is-active-button':
            editor.isActive('bulletList') || editor.isActive('orderedList'),
        }"
        @click="() => controller.cycleList()"
      >
        <ListOrderedIcon
          v-if="editor.isActive('orderedList')"
          class="size-5! bg-transparent stroke-1.5"
        />
        <ListIcon v-else class="size-5! bg-transparent stroke-1.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.taskList')"
        :class="{ 'is-active-button': editor.isActive('taskList') }"
        @click="() => controller.toggleTaskList()"
      >
        <ListChecksIcon class="size-5! bg-transparent stroke-1.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.highlight')"
        :class="{ 'is-active-button': editor.isActive('highlight') }"
        @click="() => controller.formatText('highlight')"
      >
        <HighlighterIcon class="size-4! bg-transparent" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.undo')"
        @click="() => controller.undo()"
      >
        <Undo2Icon class="size-4! bg-transparent" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        :aria-label="t('document.toolbar.redo')"
        @click="() => controller.redo()"
      >
        <Redo2Icon class="size-4! bg-transparent" />
      </Button>
    </div>
  </div>
</template>
