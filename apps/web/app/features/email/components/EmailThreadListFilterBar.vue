<script setup lang="ts">
import {
  MailIcon,
  MoreVerticalIcon,
  SquareCheckIcon,
  SquareIcon,
  StarIcon,
  Trash2Icon,
} from '@lucide/vue';
import { Button } from '~/components/ui/button';
import { DatePicker } from '~/components/ui/date-picker';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '~/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useDateTimeFormat } from '~/composables/useDateTimeFormat';
import { BULK_TRASH_MAX_SELECTION } from '~/features/email/composables/useEmailThreadSelection';
import { cn } from '~/lib/utils';

// Props
const props = defineProps<{
  unreadOnly: boolean;
  starredOnly: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  /** Hides the unread/starred/date-range filters (search proxies Gmail's own `q=`, these don't apply) - the mass-trash controls below stay usable during a search regardless. */
  isSearching: boolean;
  selectionCount: number;
  isSelectionOverCap: boolean;
  isTrashing: boolean;
}>();

// Emits
const emit = defineEmits<{
  toggleUnreadOnly: [];
  toggleStarredOnly: [];
  updateDateFrom: [string | null];
  updateDateTo: [string | null];
  /** One button covers both directions: selects every loaded thread when nothing is selected, clears the selection otherwise. */
  toggleSelectAll: [];
  trashSelected: [];
}>();

// Composables
const { t } = useI18n();
const { formatDate } = useDateTimeFormat();

// Computed
const hasDateFilter = computed(() => !!props.dateFrom || !!props.dateTo);
const hasSelection = computed(() => props.selectionCount > 0);
const selectAllLabel = computed(() =>
  hasSelection.value
    ? t('email.thread.selection.deselectAll')
    : t('email.thread.selection.selectAllLoaded'),
);
const trashDisabled = computed(
  () => !hasSelection.value || props.isSelectionOverCap || props.isTrashing,
);
const trashLabel = computed(() =>
  props.isSelectionOverCap
    ? t('email.thread.selection.overCapHint', { max: BULK_TRASH_MAX_SELECTION })
    : t('email.thread.selection.trash'),
);
</script>

<template>
  <div class="flex shrink-0 items-center justify-end gap-1 border-b p-1">
    <template v-if="!props.isSearching">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :class="cn(props.unreadOnly && 'border-primary bg-primary/10')"
              :aria-label="t('email.thread.filters.unread')"
              @click="emit('toggleUnreadOnly')"
            >
              <MailIcon class="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ t('email.thread.filters.unread') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              :class="cn(props.starredOnly && 'border-primary bg-primary/10')"
              :aria-label="t('email.thread.filters.starred')"
              @click="emit('toggleStarredOnly')"
            >
              <StarIcon class="size-3.5 shrink-0 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ t('email.thread.filters.starred') }}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Popover>
        <PopoverTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :class="cn(hasDateFilter && 'border-primary bg-primary/10')"
            :aria-label="t('email.thread.filters.dateRange')"
            :title="t('email.thread.filters.dateRange')"
          >
            <MoreVerticalIcon class="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent class="max-w-56 space-y-2" align="start">
          <p class="text-xs font-medium text-muted-foreground">
            {{ t('email.thread.filters.dateRange') }}
          </p>
          <DatePicker
            class=""
            :model-value="props.dateFrom"
            :placeholder="t('email.thread.filters.dateFrom')"
            :format-date="formatDate"
            @update:model-value="emit('updateDateFrom', $event)"
          />
          <DatePicker
            class=""
            :model-value="props.dateTo"
            :placeholder="t('email.thread.filters.dateTo')"
            :format-date="formatDate"
            @update:model-value="emit('updateDateTo', $event)"
          />
        </PopoverContent>
      </Popover>
    </template>

    <!-- Mass-trash controls (docs/email/mass-deletion-change-request.md):
         always rendered so the bar's width doesn't shift as selection state
         changes - disabled/greyed rather than hidden, same as every other
         disabled state in this bar. -->
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :class="cn(hasSelection && 'border-primary bg-primary/10')"
            :aria-label="selectAllLabel"
            @click="emit('toggleSelectAll')"
          >
            <SquareCheckIcon v-if="hasSelection" class="size-3.5 shrink-0 text-muted-foreground" />
            <SquareIcon v-else class="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ selectAllLabel }}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
    <!-- Bare count, same badge style as EmailThreadListItem.vue's
         messageCount pill - not a text label, just the number. -->
    <span
      v-if="hasSelection"
      class="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
    >
      {{ props.selectionCount }}
    </span>

    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger as-child>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :disabled="trashDisabled"
            :aria-label="trashLabel"
            @click="emit('trashSelected')"
          >
            <Trash2Icon class="size-3.5 shrink-0 text-destructive" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{{ trashLabel }}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
</template>
