<script setup lang="ts">
import {
  BoldIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  StrikethroughIcon,
} from '@lucide/vue';
import { BubbleMenu } from '@repo/editor';
import type { BlockType, TextFormat } from '@repo/editor';
import { ToolbarButton, ToolbarRoot } from 'reka-ui';
import type { Component } from 'vue';
import { BLOCK_TYPE_ICONS } from './block-type-icons';
import { formatShortcut, labelWithShortcut } from './editor-shortcut';
import type { RichTextEditorController } from './types';

type BubbleMenuShouldShow = NonNullable<
  InstanceType<typeof BubbleMenu>['$props']['shouldShow']
>;

interface BlockTypeItem {
  type: BlockType;
  shortcut: string;
}

interface FormatItem {
  format: TextFormat;
  icon: Component;
  shortcut: string;
}

const BLOCK_TYPE_ITEMS: readonly BlockTypeItem[] = [
  { type: 'paragraph', shortcut: 'Mod-Alt-0' },
  { type: 'h1', shortcut: 'Mod-Alt-1' },
  { type: 'h2', shortcut: 'Mod-Alt-2' },
  { type: 'h3', shortcut: 'Mod-Alt-3' },
  { type: 'h4', shortcut: 'Mod-Alt-4' },
];

const BLOCK_TOGGLE_ITEMS: readonly BlockTypeItem[] = [
  { type: 'bulletList', shortcut: 'Mod-Shift-8' },
  { type: 'orderedList', shortcut: 'Mod-Shift-7' },
  { type: 'taskList', shortcut: 'Mod-Shift-9' },
  { type: 'blockquote', shortcut: 'Mod-Shift-b' },
  { type: 'codeBlock', shortcut: 'Mod-Alt-c' },
];

const FORMAT_ITEMS: readonly FormatItem[] = [
  { format: 'bold', icon: BoldIcon, shortcut: 'Mod-b' },
  { format: 'italic', icon: ItalicIcon, shortcut: 'Mod-i' },
  { format: 'strike', icon: StrikethroughIcon, shortcut: 'Mod-Shift-s' },
  { format: 'code', icon: CodeIcon, shortcut: 'Mod-e' },
];

const LINK_SHORTCUT = 'Mod-k';
const PLUGIN_KEY = 'editorBubbleMenu';

// Props
const props = defineProps<{ controller: RichTextEditorController }>();

// Refs
const editor = props.controller.editor;
const isLinkFormOpen = props.controller.isLinkFormOpen;

// Composables
const { t } = useI18n();

// Computed
const displayedBlockType = computed<BlockType | 'mixed'>(() => {
  const activeType = props.controller.activeBlockType();
  if (activeType === 'mixed') return activeType;
  const isListed = BLOCK_TYPE_ITEMS.some((item) => item.type === activeType);
  return isListed ? activeType : 'paragraph';
});
const displayedBlockTypeLabel = computed(() =>
  t(`editor.blockType.${displayedBlockType.value}`),
);
const isInCodeBlock = computed(
  () => editor.value?.isActive('codeBlock') ?? false,
);
const isLinkActive = computed(() => editor.value?.isActive('link') ?? false);

// Functions
const shouldShow: BubbleMenuShouldShow = ({ editor, element, state, view }) => {
  const hasFocus = view.hasFocus() || element.contains(document.activeElement);
  if (!hasFocus || !editor.isEditable) return false;

  const { selection } = state;
  const isNodeSelection = 'node' in selection;
  if (isNodeSelection) return false;

  if (isLinkFormOpen.value) return true;
  return (
    !selection.empty &&
    state.doc.textBetween(selection.from, selection.to).length > 0
  );
};

function toggleBlockType(type: BlockType) {
  const isActive = props.controller.activeBlockType() === type;
  props.controller.setBlockType(isActive ? 'paragraph' : type);
}

function closeLinkForm() {
  isLinkFormOpen.value = false;
}

function closeLinkFormAndFocusEditor() {
  closeLinkForm();
  editor.value?.commands.focus();
}

function focusEditor() {
  editor.value?.commands.focus();
}

// Hooks
watch(isLinkFormOpen, (isOpen) => {
  // Mod-k doesn't change the selection, so the menu wouldn't re-evaluate shouldShow by itself.
  if (isOpen && editor.value) {
    editor.value.view.dispatch(
      editor.value.state.tr.setMeta(PLUGIN_KEY, 'show'),
    );
  }
});
</script>

<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :plugin-key="PLUGIN_KEY"
    :should-show="shouldShow"
    :options="{ placement: 'top', offset: 8, onHide: closeLinkForm }"
  >
    <TooltipProvider :delay-duration="300">
      <div
        v-if="isLinkFormOpen"
        class="rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
        @keydown.esc.stop="closeLinkFormAndFocusEditor"
      >
        <EditorLinkForm
          :controller="controller"
          @done="closeLinkFormAndFocusEditor"
        />
      </div>
      <ToolbarRoot
        v-else
        :aria-label="t('editor.format.label')"
        class="flex items-center gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <DropdownMenu>
          <ToolbarButton as-child>
            <DropdownMenuTrigger as-child>
              <Button
                variant="ghost"
                size="sm"
                class="gap-1 px-2"
                :aria-label="t('editor.blockType.label')"
              >
                {{ displayedBlockTypeLabel }}
                <ChevronDownIcon class="size-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
          </ToolbarButton>
          <DropdownMenuContent
            align="start"
            @close-auto-focus.prevent="focusEditor"
          >
            <DropdownMenuItem
              v-for="item in BLOCK_TYPE_ITEMS"
              :key="item.type"
              @select="controller.setBlockType(item.type)"
            >
              <component :is="BLOCK_TYPE_ICONS[item.type]" class="size-4" />
              {{ t(`editor.blockType.${item.type}`) }}
              <CheckIcon
                v-if="displayedBlockType === item.type"
                class="ml-1 size-3.5"
              />
              <DropdownMenuShortcut>
                {{ formatShortcut(item.shortcut) }}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" class="mx-0.5 h-5" />

        <Tooltip v-for="item in FORMAT_ITEMS" :key="item.format">
          <TooltipTrigger as-child>
            <ToolbarButton as-child>
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                :class="{ 'is-active-button': editor.isActive(item.format) }"
                :disabled="isInCodeBlock"
                :aria-label="t(`editor.format.${item.format}`)"
                :aria-pressed="editor.isActive(item.format)"
                @click="controller.formatText(item.format)"
              >
                <component :is="item.icon" class="size-3.5" />
              </Button>
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>
            {{
              labelWithShortcut(
                t(`editor.format.${item.format}`),
                item.shortcut,
              )
            }}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" class="mx-0.5 h-5" />

        <Tooltip v-for="item in BLOCK_TOGGLE_ITEMS" :key="item.type">
          <TooltipTrigger as-child>
            <ToolbarButton as-child>
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                :class="{
                  'is-active-button':
                    controller.activeBlockType() === item.type,
                }"
                :aria-label="t(`editor.blockType.${item.type}`)"
                :aria-pressed="controller.activeBlockType() === item.type"
                @click="toggleBlockType(item.type)"
              >
                <component :is="BLOCK_TYPE_ICONS[item.type]" class="size-3.5" />
              </Button>
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>
            {{
              labelWithShortcut(
                t(`editor.blockType.${item.type}`),
                item.shortcut,
              )
            }}
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" class="mx-0.5 h-5" />

        <Tooltip>
          <TooltipTrigger as-child>
            <ToolbarButton as-child>
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                :class="{ 'is-active-button': isLinkActive }"
                :disabled="isInCodeBlock"
                :aria-label="t('editor.link.label')"
                :aria-pressed="isLinkActive"
                @click="isLinkFormOpen = true"
              >
                <LinkIcon class="size-3.5" />
              </Button>
            </ToolbarButton>
          </TooltipTrigger>
          <TooltipContent>
            {{ labelWithShortcut(t('editor.link.label'), LINK_SHORTCUT) }}
          </TooltipContent>
        </Tooltip>
      </ToolbarRoot>
    </TooltipProvider>
  </BubbleMenu>
</template>
