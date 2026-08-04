<script setup lang="ts">
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Maximize2Icon,
} from '@lucide/vue';
import type { HomeOverviewCalendarTaskItem } from '~/features/home/types';
import { priorityIcon } from '~/features/task/lib/task-display';

// Props
const props = defineProps<{
  tasks: HomeOverviewCalendarTaskItem[];
  loading?: boolean;
}>();

// Composables
const { t, localeProperties } = useI18n();
const { formatDate } = useDateTimeFormat();

// Matches the backend window in apps/api/src/services/overview.service.ts
// (`CALENDAR_DAYS_BEFORE`/`CALENDAR_DAYS_AFTER`): the day strip only pages
// through dates the API actually fetched tasks for.
const DAYS_BEFORE = 7;
const DAYS_AFTER = 21;
const VISIBLE_DAYS = 7;

function startOfDay(date: Date): Date {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function addDays(date: Date, amount: number): Date {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + amount);
  return clone;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Refs
const today = startOfDay(new Date());
const todayIndex = DAYS_BEFORE;
const days = Array.from({ length: DAYS_BEFORE + DAYS_AFTER + 1 }, (_, i) =>
  addDays(today, i - DAYS_BEFORE),
);
const maxWindowStart = days.length - VISIBLE_DAYS;

// Centers today in the strip on first render, same as the mock. Also the
// target position for the reset-to-today button.
const initialWindowStart = Math.min(
  maxWindowStart,
  Math.max(0, todayIndex - Math.floor(VISIBLE_DAYS / 2)),
);
const windowStart = ref(initialWindowStart);
const selectedIndex = ref(todayIndex);

// Computed
const visibleDays = computed(() =>
  days.slice(windowStart.value, windowStart.value + VISIBLE_DAYS),
);
const canGoPrevious = computed(() => windowStart.value > 0);
const canGoNext = computed(() => windowStart.value < maxWindowStart);
const selectedDate = computed(() => days[selectedIndex.value] ?? today);
const isSelectedToday = computed(
  () => dateKey(selectedDate.value) === dateKey(today),
);
// Only disables the reset button once there is nothing left to reset: the
// strip is back at its initial scroll position and today is selected.
const isAtToday = computed(
  () => isSelectedToday.value && windowStart.value === initialWindowStart,
);

const weekdayFormatter = computed(
  () =>
    new Intl.DateTimeFormat(localeProperties.value.language, {
      weekday: 'short',
    }),
);
const monthFormatter = computed(
  () =>
    new Intl.DateTimeFormat(localeProperties.value.language, { month: 'long' }),
);

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

// One entry per month covered by the fetched window (usually 1-2, since
// the window is only DAYS_BEFORE + DAYS_AFTER wide), each pointing at the
// first day of that month still inside the window.
const monthOptions = computed(() => {
  const options: { key: string; label: string; firstIndex: number }[] = [];
  const seen = new Set<string>();
  days.forEach((day, index) => {
    const key = monthKey(day);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    options.push({
      key,
      label: monthFormatter.value.format(day),
      firstIndex: index,
    });
  });
  return options;
});
const selectedMonthKey = computed(() => monthKey(selectedDate.value));

// Grouped by day so the panel below the strip can look up the selected
// day's tasks without re-scanning the full list on every click.
const tasksByDay = computed(() => {
  const map = new Map<string, HomeOverviewCalendarTaskItem[]>();
  for (const task of props.tasks) {
    if (!task.dueDate) {
      continue;
    }
    const key = dateKey(new Date(task.dueDate));
    const dayTasks = map.get(key) ?? [];
    dayTasks.push(task);
    map.set(key, dayTasks);
  }
  return map;
});
const selectedDayTasks = computed(
  () => tasksByDay.value.get(dateKey(selectedDate.value)) ?? [],
);

// Functions
function goToPreviousWeek() {
  windowStart.value = Math.max(0, windowStart.value - VISIBLE_DAYS);
  selectedIndex.value = windowStart.value;
}

function goToNextWeek() {
  windowStart.value = Math.min(
    maxWindowStart,
    windowStart.value + VISIBLE_DAYS,
  );
  selectedIndex.value = windowStart.value;
}

function onMonthChange(value: unknown) {
  if (typeof value !== 'string') {
    return;
  }
  const option = monthOptions.value.find(
    (monthOption) => monthOption.key === value,
  );
  if (!option) {
    return;
  }
  selectedIndex.value = option.firstIndex;
  windowStart.value = Math.min(maxWindowStart, Math.max(0, option.firstIndex));
}

function resetToToday() {
  selectedIndex.value = todayIndex;
  windowStart.value = initialWindowStart;
}

function agentInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('');
}
</script>

<template>
  <Card class="gap-0 overflow-hidden px-6 shadow-none">
    <CardHeader class="flex items-center justify-between gap-3 px-0! pb-4!">
      <div class="flex min-w-0 items-center gap-2.5">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400"
        >
          <CalendarIcon class="size-4 stroke-1.5" />
        </div>
        <CardTitle class="truncate">
          <NuxtLinkLocale
            to="/tasks"
            :title="t('home.overview.viewAll')"
            class="text-base hover:underline"
          >
            {{ t('home.overview.calendar.title') }}
          </NuxtLinkLocale>
        </CardTitle>
        <Select
          :model-value="selectedMonthKey"
          @update:model-value="onMonthChange"
        >
          <SelectTrigger
            size="sm"
            class="h-auto shrink-0 gap-1 border-none bg-transparent p-0 text-xxs text-muted-foreground shadow-none hover:text-foreground"
          >
            <SelectValue class="capitalize" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="option in monthOptions"
              :key="option.key"
              :value="option.key"
              class="capitalize"
            >
              {{ option.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          class="h-6 gap-1 px-2 text-xxs"
          :disabled="isAtToday"
          :aria-label="t('home.overview.calendar.resetToToday')"
          @click="resetToToday"
        >
          <CalendarIcon class="size-3" />
          {{ t('home.overview.calendar.today') }}
        </Button>
        <NuxtLinkLocale
          to="/tasks"
          :title="t('home.overview.viewAll')"
          class="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Maximize2Icon class="size-3" />
        </NuxtLinkLocale>
      </div>
    </CardHeader>

    <CardContent class="p-0">
      <div v-if="loading" class="space-y-3">
        <Skeleton class="h-14 w-full" />
        <Skeleton class="h-20 w-full" />
      </div>

      <template v-else>
        <div class="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            :disabled="!canGoPrevious"
            :aria-label="t('home.overview.calendar.previousWeek')"
            @click="goToPreviousWeek"
          >
            <ChevronLeftIcon class="size-4 stroke-1.5" />
          </Button>

          <div class="grid flex-1 grid-cols-7 gap-1">
            <button
              v-for="(day, i) in visibleDays"
              :key="dateKey(day)"
              type="button"
              class="flex flex-col items-center gap-1 rounded-lg py-2 text-xs transition-colors"
              :class="
                windowStart + i === selectedIndex
                  ? 'border-2'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              "
              :aria-pressed="windowStart + i === selectedIndex"
              @click="selectedIndex = windowStart + i"
            >
              <span class="capitalize">{{ weekdayFormatter.format(day) }}</span>
              <span class="text-sm font-semibold">{{ day.getDate() }}</span>
              <span
                v-if="tasksByDay.has(dateKey(day))"
                class="size-1 rounded-full"
                :class="
                  windowStart + i === selectedIndex
                    ? 'bg-primary-foreground'
                    : 'bg-primary'
                "
              />
            </button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            :disabled="!canGoNext"
            :aria-label="t('home.overview.calendar.nextWeek')"
            @click="goToNextWeek"
          >
            <ChevronRightIcon class="size-4 stroke-1.5" />
          </Button>
        </div>

        <div class="mt-4 rounded-xl bg-accent/50 px-4 py-3">
          <p class="text-xs font-medium text-muted-foreground">
            {{
              isSelectedToday
                ? t('home.overview.calendar.today')
                : formatDate(selectedDate.toISOString())
            }}
            · {{ selectedDayTasks.length }}
          </p>

          <p
            v-if="selectedDayTasks.length === 0"
            class="mt-2 text-sm text-muted-foreground"
          >
            {{ t('home.overview.calendar.empty') }}
          </p>

          <div v-else class="mt-1 divide-y divide-foreground/5">
            <NuxtLinkLocale
              v-for="task in selectedDayTasks"
              :key="task.id"
              :to="`/tasks/${task.id}`"
              class="flex items-center gap-2 py-2 text-sm"
            >
              <component
                :is="priorityIcon(task.priority)"
                v-if="task.priority !== 'none'"
                class="size-3.5 shrink-0 text-muted-foreground"
              />
              <span class="grow truncate font-medium text-foreground">{{
                task.title
              }}</span>
              <Avatar
                v-if="task.assignedAgent"
                class="size-6 shrink-0"
                :title="task.assignedAgent.name"
              >
                <AvatarFallback
                  class="border border-foreground/40 text-xxs text-foreground"
                >
                  {{ agentInitials(task.assignedAgent.name) }}
                </AvatarFallback>
              </Avatar>
            </NuxtLinkLocale>
          </div>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
