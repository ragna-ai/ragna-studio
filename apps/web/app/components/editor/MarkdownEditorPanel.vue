<script setup lang="ts">
import type { MarkdownEditorBoxProps } from './MarkdownEditorBox.vue';
import MarkdownEditorBox from './MarkdownEditorBox.vue';
import {
  MARKDOWN_FIELD_VIEWS,
  useMarkdownFieldView,
} from './markdown-field-view';

export type MarkdownEditorPanelProps = Pick<
  MarkdownEditorBoxProps,
  'profile' | 'placeholder' | 'invalid' | 'maxLength'
> & { title: string };

// Props
defineProps<MarkdownEditorPanelProps>();

// Refs
const open = defineModel<boolean>('open', { required: true });
const model = defineModel<string>({ required: true });
const view = useMarkdownFieldView();
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent side="right" size="lg" class="gap-0 p-0">
      <SheetHeader>
        <SheetTitle>{{ title }}</SheetTitle>
        <SheetDescription class="sr-only">{{ title }}</SheetDescription>
        <ViewSwitcher v-model="view" :options="MARKDOWN_FIELD_VIEWS" />
      </SheetHeader>
      <div class="flex min-h-0 flex-1 flex-col p-6">
        <MarkdownEditorBox
          v-model="model"
          :view="view"
          :profile="profile"
          :placeholder="placeholder"
          :invalid="invalid"
          :max-length="maxLength"
          :aria-label="title"
          root-class="gap-1.5"
          @escape="open = false"
        />
      </div>
    </SheetContent>
  </Sheet>
</template>
