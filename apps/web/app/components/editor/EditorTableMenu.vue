<script setup lang="ts">
import {
  BetweenHorizontalEndIcon,
  BetweenHorizontalStartIcon,
  BetweenVerticalEndIcon,
  BetweenVerticalStartIcon,
  Trash2Icon,
} from '@lucide/vue';
import { BubbleMenu } from '@repo/editor';
import { ToolbarButton, ToolbarRoot } from 'reka-ui';
import type { Component } from 'vue';
import type { RichTextEditorController } from './types';

type BubbleMenuProps = InstanceType<typeof BubbleMenu>['$props'];
type TableMenuShouldShow = NonNullable<BubbleMenuProps['shouldShow']>;

interface TableAction {
  id: string;
  icon: Component;
  labelKey: string;
  run: () => boolean;
  isDestructive?: boolean;
}

interface TableReference {
  getBoundingClientRect: () => DOMRect;
  contextElement: Element;
}

const PLUGIN_KEY = 'editorTableMenu';

// Props
const props = defineProps<{ controller: RichTextEditorController }>();

// Refs
const editor = props.controller.editor;

// Composables
const { t } = useI18n();

// Computed
const actionGroups = computed<TableAction[][]>(() => [
  [
    {
      id: 'addRowBefore',
      icon: BetweenHorizontalStartIcon,
      labelKey: 'editor.table.addRowBefore',
      run: props.controller.addRowBefore,
    },
    {
      id: 'addRowAfter',
      icon: BetweenHorizontalEndIcon,
      labelKey: 'editor.table.addRowAfter',
      run: props.controller.addRowAfter,
    },
    {
      id: 'deleteRow',
      icon: Trash2Icon,
      labelKey: 'editor.table.deleteRow',
      run: props.controller.deleteRow,
    },
  ],
  [
    {
      id: 'addColumnBefore',
      icon: BetweenVerticalStartIcon,
      labelKey: 'editor.table.addColumnBefore',
      run: props.controller.addColumnBefore,
    },
    {
      id: 'addColumnAfter',
      icon: BetweenVerticalEndIcon,
      labelKey: 'editor.table.addColumnAfter',
      run: props.controller.addColumnAfter,
    },
    {
      id: 'deleteColumn',
      icon: Trash2Icon,
      labelKey: 'editor.table.deleteColumn',
      run: props.controller.deleteColumn,
    },
  ],
  [
    {
      id: 'deleteTable',
      icon: Trash2Icon,
      labelKey: 'editor.table.deleteTable',
      run: props.controller.deleteTable,
      isDestructive: true,
    },
  ],
]);

// Functions
const shouldShow: TableMenuShouldShow = ({ element, state, view }) => {
  const hasFocus = view.hasFocus() || element.contains(document.activeElement);
  if (!hasFocus || !state.selection.empty) return false;
  return props.controller.isInTable();
};

// Anchors the menu to the table, so it floats above it instead of covering the cell being edited.
function getTableReference(): TableReference | null {
  const view = editor.value?.view;
  if (!view) return null;

  const { node } = view.domAtPos(view.state.selection.from);
  const element = node instanceof Element ? node : node.parentElement;
  const table = element?.closest('table');
  if (!table) return null;

  return {
    getBoundingClientRect: () => table.getBoundingClientRect(),
    contextElement: table,
  };
}
</script>

<template>
  <BubbleMenu
    v-if="editor"
    :editor="editor"
    :plugin-key="PLUGIN_KEY"
    :should-show="shouldShow"
    :get-referenced-virtual-element="getTableReference"
    :options="{ placement: 'top-start', offset: 8 }"
  >
    <TooltipProvider :delay-duration="300">
      <ToolbarRoot
        :aria-label="t('editor.table.label')"
        class="flex items-center gap-0.5 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      >
        <template v-for="(group, index) in actionGroups" :key="index">
          <Separator
            v-if="index > 0"
            orientation="vertical"
            class="mx-0.5 h-5"
          />
          <Tooltip v-for="action in group" :key="action.id">
            <TooltipTrigger as-child>
              <ToolbarButton as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-8"
                  :class="{ 'text-destructive': action.isDestructive }"
                  :aria-label="t(action.labelKey)"
                  @click="action.run()"
                >
                  <component :is="action.icon" class="size-4" />
                </Button>
              </ToolbarButton>
            </TooltipTrigger>
            <TooltipContent>{{ t(action.labelKey) }}</TooltipContent>
          </Tooltip>
        </template>
      </ToolbarRoot>
    </TooltipProvider>
  </BubbleMenu>
</template>
