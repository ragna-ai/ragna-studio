<script setup lang="ts">
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisIcon,
  Maximize2Icon,
  PlugIcon,
  Trash2Icon,
} from '@lucide/vue';

// Props
interface Props {
  position: number;
  isMcpRow: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** Sort or filters are active: moving is not offered. */
  hasActiveView: boolean;
  isMovingRow: boolean;
}

const props = defineProps<Props>();

const isOpen = defineModel<boolean>('open', { default: false });

// Emits
const emit = defineEmits<{
  (e: 'expand'): void;
  (e: 'move-up'): void;
  (e: 'move-down'): void;
  (e: 'delete'): void;
}>();

// Composables
const { t } = useI18n();

// Computed
const isMoveDisabled = computed(() => props.hasActiveView || props.isMovingRow);
const canShowMoveUp = computed(() => props.hasActiveView || !props.isFirst);
const canShowMoveDown = computed(() => props.hasActiveView || !props.isLast);
</script>

<template>
  <div class="flex w-full items-center justify-center gap-1">
    <Tooltip v-if="isMcpRow">
      <TooltipTrigger as-child>
        <PlugIcon class="size-3 shrink-0 stroke-1.5 text-stone-500" />
      </TooltipTrigger>
      <TooltipContent>{{ t('dataset.grid.writtenByMcp') }}</TooltipContent>
    </Tooltip>

    <div class="relative flex size-6 items-center justify-center">
      <span
        class="text-xs text-stone-500 tabular-nums group-focus-within/row:opacity-0 group-hover/row:opacity-0 group-has-data-[state=open]/row:opacity-0"
      >
        {{ position }}
      </span>

      <DropdownMenu v-model:open="isOpen">
        <DropdownMenuTrigger as-child>
          <Button
            variant="ghost"
            size="icon"
            tabindex="-1"
            class="pointer-events-none absolute inset-0 size-6 opacity-0 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100 data-[state=open]:pointer-events-auto data-[state=open]:opacity-100"
            :aria-label="t('dataset.sheet.rowMenu.open')"
          >
            <EllipsisIcon class="size-4 stroke-1.5 text-stone-500" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" @close-auto-focus.prevent>
          <DropdownMenuItem @select="emit('expand')">
            <Maximize2Icon class="size-4 stroke-1.5" />
            {{ t('dataset.sheet.rowMenu.expand') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="canShowMoveUp"
            :disabled="isMoveDisabled"
            @select="emit('move-up')"
          >
            <ArrowUpIcon class="size-4 stroke-1.5" />
            {{ t('dataset.sheet.rowMenu.moveUp') }}
          </DropdownMenuItem>
          <DropdownMenuItem
            v-if="canShowMoveDown"
            :disabled="isMoveDisabled"
            @select="emit('move-down')"
          >
            <ArrowDownIcon class="size-4 stroke-1.5" />
            {{ t('dataset.sheet.rowMenu.moveDown') }}
          </DropdownMenuItem>
          <DropdownMenuLabel
            v-if="hasActiveView"
            class="text-xs font-normal text-stone-500"
          >
            {{ t('dataset.sheet.rowMenu.moveDisabled') }}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" @select="emit('delete')">
            <Trash2Icon class="size-4 stroke-1.5" />
            {{ t('dataset.sheet.rowMenu.delete') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>
