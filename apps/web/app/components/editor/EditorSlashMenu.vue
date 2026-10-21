<script setup lang="ts">
import type { SlashCommandId } from '@repo/editor';
import { cn } from '~/lib/utils';
import { filterSlashItems, SLASH_ITEMS } from './slash-items';
import type { RichTextEditorController } from './types';

// Props
const props = defineProps<{ controller: RichTextEditorController }>();

// Refs
const highlightedIndex = ref(0);
const anchorRect = shallowRef<DOMRect | null>(null);
const listbox = useTemplateRef<HTMLElement>('listbox');
const listboxId = useId();

// Composables
const { t } = useI18n();

// Computed
const slashMenu = computed(() => props.controller.slashMenu.value);
const isImageFormOpen = computed(() => props.controller.isImageFormOpen.value);
const isOpen = computed(
  () => slashMenu.value !== null || isImageFormOpen.value,
);
const items = computed(() =>
  filterSlashItems(SLASH_ITEMS, slashMenu.value?.query ?? '', t),
);
const activeOptionId = computed(() => {
  const item = items.value[highlightedIndex.value];
  return item ? optionId(item.id) : undefined;
});
// A new object per rect makes the popper reposition as the caret moves.
const virtualAnchor = computed(() => {
  const rect = anchorRect.value;
  return rect ? { getBoundingClientRect: () => rect } : undefined;
});

// Functions
function optionId(id: SlashCommandId): string {
  return `${listboxId}-${id}`;
}

function selectItem(id: SlashCommandId) {
  slashMenu.value?.select(id);
}

function moveHighlight(step: 1 | -1) {
  const count = items.value.length;
  highlightedIndex.value = (highlightedIndex.value + step + count) % count;
}

function handleKey(event: KeyboardEvent): boolean {
  const item = items.value[highlightedIndex.value];
  if (!item) {
    return false;
  }
  switch (event.key) {
    case 'ArrowDown':
      moveHighlight(1);
      return true;
    case 'ArrowUp':
      moveHighlight(-1);
      return true;
    case 'Enter':
      selectItem(item.id);
      return true;
    default:
      return false;
  }
}

function closeImageForm() {
  props.controller.isImageFormOpen.value = false;
  props.controller.editor.value?.commands.focus();
}

function handleOpenChange(open: boolean) {
  if (!open && isImageFormOpen.value) {
    closeImageForm();
  }
}

function scrollHighlightedIntoView() {
  const id = activeOptionId.value;
  if (!id) {
    return;
  }
  listbox.value
    ?.querySelector(`[id="${id}"]`)
    ?.scrollIntoView({ block: 'nearest' });
}

// Hooks
watch(
  slashMenu,
  (menu) => {
    const rect = menu?.clientRect();
    if (rect) {
      anchorRect.value = rect;
    }
  },
  { immediate: true },
);

watch(
  () => slashMenu.value?.query,
  () => {
    highlightedIndex.value = 0;
  },
);

watch(activeOptionId, () => nextTick(scrollHighlightedIntoView));

onMounted(() => props.controller.setSlashKeyHandler(handleKey));
onBeforeUnmount(() => props.controller.setSlashKeyHandler(null));
</script>

<template>
  <Popover :open="isOpen" @update:open="handleOpenChange">
    <PopoverAnchor :reference="virtualAnchor" />
    <PopoverContent
      side="bottom"
      align="start"
      :class="
        isImageFormOpen ? 'w-80 p-2' : 'max-h-72 w-64 overflow-y-auto p-1'
      "
      @open-auto-focus.prevent
    >
      <EditorImageForm
        v-if="isImageFormOpen"
        :controller="controller"
        @done="closeImageForm"
      />
      <template v-else>
        <div
          v-if="items.length"
          ref="listbox"
          role="listbox"
          :aria-label="t('editor.slash.label')"
          :aria-activedescendant="activeOptionId"
          @mousedown.prevent
        >
          <div
            v-for="(item, index) in items"
            :id="optionId(item.id)"
            :key="item.id"
            role="option"
            :aria-selected="index === highlightedIndex"
            :class="
              cn(
                'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                index === highlightedIndex &&
                  'bg-accent text-accent-foreground',
              )
            "
            @mouseenter="highlightedIndex = index"
            @click="selectItem(item.id)"
          >
            <component :is="item.icon" class="size-4 shrink-0" />
            <span class="flex-1 truncate">{{ t(item.labelKey) }}</span>
            <span
              v-if="item.markdownShortcut"
              class="font-mono text-xs text-muted-foreground"
            >
              {{ item.markdownShortcut.trim() }}
            </span>
          </div>
        </div>
        <p v-else class="px-2 py-1.5 text-sm text-muted-foreground">
          {{ t('editor.slash.noResults') }}
        </p>
      </template>
    </PopoverContent>
  </Popover>
</template>
