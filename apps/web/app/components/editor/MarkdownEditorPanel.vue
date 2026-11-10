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

// Composables
const { t } = useI18n();
</script>

<template>
  <Sheet v-model:open="open">
    <SheetContent
      side="right"
      :show-close-button="false"
      class="w-[45rem] gap-0 border-l bg-background p-0 shadow-popover sm:max-w-none"
    >
      <SheetHeader
        class="h-14 flex-row items-center gap-0 border-b py-0 pr-4 pl-6"
      >
        <SheetTitle class="text-title-sm">{{ title }}</SheetTitle>
        <SheetDescription class="sr-only">{{ title }}</SheetDescription>
        <ViewSwitcher
          v-model="view"
          :options="MARKDOWN_FIELD_VIEWS"
          size="sm"
          class="ml-3"
        />
        <SheetClose as-child>
          <Button
            variant="ghost"
            size="icon-sm"
            class="ml-auto text-icon"
            :aria-label="t('editor.field.close')"
          >
            <Icon name="hugeicons:cancel-01" class="size-4" />
          </Button>
        </SheetClose>
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
        />
      </div>
    </SheetContent>
  </Sheet>
</template>
