<script setup lang="ts">
import {
  AlignCenterIcon,
  AlignJustifyIcon,
  AlignRightIcon,
  BoldIcon,
  Code2Icon,
  Heading1Icon,
  Heading2Icon,
  HighlighterIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListChecksIcon,
  ListIcon,
  ListOrderedIcon,
  Redo2Icon,
  StrikethroughIcon,
  TableIcon,
  TextIcon,
  UnderlineIcon,
  Undo2Icon,
} from '@lucide/vue';
import type { DocumentEditorController } from '~/features/document/composables/useDocumentEditor';
import { cn } from '~/lib/utils';

/**
 * The toolbar only drives formatting/table/link commands, never markdown
 * serialization, so it accepts any controller offering this subset - both
 * `DocumentEditorController` and the email feature's
 * `EmailComposeEditorController` satisfy it, without coupling this component
 * to a controller type it doesn't fully use.
 */
export type EditorToolbarController = Pick<
  DocumentEditorController,
  | 'editor'
  | 'formatText'
  | 'cycleList'
  | 'cycleTextOrientation'
  | 'toggleTaskList'
  | 'toggleCodeBlock'
  | 'undo'
  | 'redo'
  | 'isInTable'
  | 'insertTable'
  | 'addRowBefore'
  | 'addRowAfter'
  | 'deleteRow'
  | 'addColumnBefore'
  | 'addColumnAfter'
  | 'deleteColumn'
  | 'deleteTable'
  | 'toggleHeaderRow'
  | 'toggleHeaderColumn'
  | 'getLink'
  | 'setLink'
  | 'unsetLink'
  | 'insertImage'
  | 'wordCount'
>;

// Props
const props = defineProps<{
  controller: EditorToolbarController;
  showWordCount?: boolean;
  class?: string;
}>();

// Composables
const { t } = useI18n();

// Refs
const editor = props.controller.editor;
const isLinkPopoverOpen = ref(false);
const linkUrl = ref('');
const isImagePopoverOpen = ref(false);
const imageUrl = ref('');

// Watchers
// Prefills with the link at the caret each time the popover opens, rather
// than on every keystroke, so editing one link doesn't leak its URL into
// the next.
watch(isLinkPopoverOpen, (open) => {
  if (open) {
    linkUrl.value = props.controller.getLink();
  }
});

// Functions
function submitLink() {
  const url = linkUrl.value.trim();
  if (url) {
    props.controller.setLink(url);
  } else {
    props.controller.unsetLink();
  }
  isLinkPopoverOpen.value = false;
}

function removeLink() {
  props.controller.unsetLink();
  isLinkPopoverOpen.value = false;
}

function submitImage() {
  const url = imageUrl.value.trim();
  if (url) {
    props.controller.insertImage(url);
  }
  imageUrl.value = '';
  isImagePopoverOpen.value = false;
}
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
        :aria-label="t('document.toolbar.codeBlock')"
        :class="{ 'is-active-button': editor.isActive('codeBlock') }"
        @click="() => controller.toggleCodeBlock()"
      >
        <Code2Icon class="size-4! bg-transparent" />
      </Button>
      <Popover v-model:open="isLinkPopoverOpen">
        <PopoverTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            :aria-label="t('document.toolbar.link.label')"
            :class="{ 'is-active-button': editor.isActive('link') }"
          >
            <LinkIcon class="size-4! bg-transparent" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-80" align="start">
          <form class="flex items-center gap-2" @submit.prevent="submitLink">
            <Input
              v-model="linkUrl"
              type="url"
              autofocus
              :placeholder="t('document.toolbar.link.placeholder')"
              :aria-label="t('document.toolbar.link.label')"
            />
            <Button type="submit" size="sm">
              {{ t('document.toolbar.link.apply') }}
            </Button>
            <Button
              v-if="editor.isActive('link')"
              type="button"
              variant="ghost"
              size="sm"
              @click="removeLink"
            >
              {{ t('document.toolbar.link.remove') }}
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <Popover v-model:open="isImagePopoverOpen">
        <PopoverTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            :aria-label="t('document.toolbar.image.label')"
          >
            <ImageIcon class="size-4! bg-transparent" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="w-80" align="start">
          <form class="flex items-center gap-2" @submit.prevent="submitImage">
            <Input
              v-model="imageUrl"
              type="url"
              autofocus
              :placeholder="t('document.toolbar.image.placeholder')"
              :aria-label="t('document.toolbar.image.label')"
            />
            <Button type="submit" size="sm">
              {{ t('document.toolbar.image.insert') }}
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            :aria-label="t('document.toolbar.table.insert')"
            :class="{ 'is-active-button': editor.isActive('table') }"
          >
            <TableIcon class="size-4! bg-transparent stroke-1.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem @click="() => controller.insertTable()">
            {{ t('document.toolbar.table.insert') }}
          </DropdownMenuItem>
          <template v-if="controller.isInTable()">
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="() => controller.addRowBefore()">
              {{ t('document.toolbar.table.addRowBefore') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="() => controller.addRowAfter()">
              {{ t('document.toolbar.table.addRowAfter') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="() => controller.deleteRow()">
              {{ t('document.toolbar.table.deleteRow') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="() => controller.addColumnBefore()">
              {{ t('document.toolbar.table.addColumnBefore') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="() => controller.addColumnAfter()">
              {{ t('document.toolbar.table.addColumnAfter') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="() => controller.deleteColumn()">
              {{ t('document.toolbar.table.deleteColumn') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="() => controller.toggleHeaderRow()">
              {{ t('document.toolbar.table.toggleHeaderRow') }}
            </DropdownMenuItem>
            <DropdownMenuItem @click="() => controller.toggleHeaderColumn()">
              {{ t('document.toolbar.table.toggleHeaderColumn') }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="() => controller.deleteTable()">
              {{ t('document.toolbar.table.deleteTable') }}
            </DropdownMenuItem>
          </template>
        </DropdownMenuContent>
      </DropdownMenu>
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
    <p
      v-if="props.showWordCount"
      class="self-center text-xs whitespace-nowrap text-muted-foreground"
    >
      {{ t('document.toolbar.wordCount', { count: controller.wordCount() }) }}
    </p>
  </div>
</template>
