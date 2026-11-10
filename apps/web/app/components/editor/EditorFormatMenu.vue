<script setup lang="ts">
import type { SlashCommandId } from '@repo/editor';
import { FORMAT_MENU_ICONS } from './format-menu-icons';
import { SLASH_ITEMS } from './slash-items';
import type { RichTextEditorController } from './types';

// Props
const props = defineProps<{ controller: RichTextEditorController }>();

// Composables
const { t } = useI18n();

// Computed
const items = computed(() =>
  SLASH_ITEMS.filter(
    (item) =>
      item.id !== 'image' &&
      props.controller.profile.slashCommands.includes(item.id),
  ),
);

// Functions
function runCommand(id: SlashCommandId) {
  switch (id) {
    case 'image':
      return;
    case 'horizontalRule':
      props.controller.setHorizontalRule();
      return;
    case 'table':
      props.controller.insertTable();
      return;
    default:
      props.controller.setBlockType(id);
  }
}
</script>

<template>
  <DropdownMenu>
    <Tooltip>
      <TooltipTrigger as-child>
        <DropdownMenuTrigger as-child>
          <Button
            variant="outline"
            size="icon-xs"
            class="text-icon"
            :aria-label="t('editor.field.format')"
          >
            <Icon name="hugeicons:text-font" class="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent>{{ t('editor.field.format') }}</TooltipContent>
    </Tooltip>
    <DropdownMenuContent
      side="top"
      align="end"
      :side-offset="8"
      class="w-60 rounded-lg p-1.5 shadow-popover"
      @close-auto-focus.prevent
    >
      <DropdownMenuGroup>
        <DropdownMenuItem
          v-for="item in items"
          :key="item.id"
          class="h-9 px-2"
          @select="runCommand(item.id)"
        >
          <Icon :name="FORMAT_MENU_ICONS[item.id]" class="size-4" />
          {{ t(item.labelKey) }}
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
