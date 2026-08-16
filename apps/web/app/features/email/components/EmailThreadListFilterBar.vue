<script setup lang="ts">
import { MailIcon, MoreVerticalIcon, StarIcon } from '@lucide/vue';
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
import { cn } from '~/lib/utils';

// Props
const props = defineProps<{
  unreadOnly: boolean;
  starredOnly: boolean;
  dateFrom: string | null;
  dateTo: string | null;
}>();

// Emits
const emit = defineEmits<{
  toggleUnreadOnly: [];
  toggleStarredOnly: [];
  updateDateFrom: [string | null];
  updateDateTo: [string | null];
}>();

// Composables
const { t } = useI18n();
const { formatDate } = useDateTimeFormat();

// Computed
const hasDateFilter = computed(() => !!props.dateFrom || !!props.dateTo);
</script>

<template>
  <div class="flex shrink-0 items-center justify-end gap-1 border-b p-1">
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
  </div>
</template>
