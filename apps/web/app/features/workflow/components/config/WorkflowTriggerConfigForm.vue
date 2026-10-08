<script setup lang="ts">
import type { TriggerConfig, WorkflowNode } from '@repo/workflow';
import { getNextCronOccurrences, isValidCronExpression } from '@repo/workflow';

// Imports

type TriggerNode = Extract<WorkflowNode, { type: 'trigger' }>;
type Preset = 'hourly' | 'daily' | 'weekly' | 'custom';

const PRESETS: Preset[] = ['hourly', 'daily', 'weekly', 'custom'];
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
const NEXT_RUN_COUNT = 3;
const DEFAULT_HOUR = 9;
const DEFAULT_MINUTE = 0;
const DEFAULT_WEEKDAY = '1'; // Monday
const HOURLY_CRON = '0 * * * *';
const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

// Props
// The panel only renders this form when node.type === 'trigger', so the
// narrowed node (and therefore its config) is guaranteed to be TriggerConfig.
const props = defineProps<{
  node: TriggerNode;
}>();

// Composables
const { t } = useI18n();

// Functions
// Builds the cron string for every preset except 'custom', whose value comes
// straight from the raw `customCron` input instead.
function buildPresetCron(
  activePreset: Preset,
  presetHour: number,
  presetMinute: number,
  presetWeekday: string,
): string {
  switch (activePreset) {
    case 'hourly':
      return HOURLY_CRON;
    case 'daily':
      return `${presetMinute} ${presetHour} * * *`;
    case 'weekly':
      return `${presetMinute} ${presetHour} * * ${presetWeekday}`;
    // Unreachable: the `cron` computed below never calls this for 'custom',
    // it reads `customCron` directly. Kept only so the switch stays exhaustive.
    case 'custom':
      return '';
  }
}

// Reverse-maps a stored cron string to a preset (and its sub-inputs) when it
// exactly matches one this form can produce; anything else (a hand-written
// cron, or no schedule at all) becomes 'custom' so nothing is silently lost.
function matchScheduleConfig(config: TriggerConfig) {
  const fallback = {
    preset: 'daily' as Preset,
    hour: DEFAULT_HOUR,
    minute: DEFAULT_MINUTE,
    weekday: DEFAULT_WEEKDAY,
    customCron: '',
  };
  if (config.kind !== 'schedule') {
    return fallback;
  }

  const cronExpression = config.cron;
  if (cronExpression === HOURLY_CRON) {
    return { ...fallback, preset: 'hourly' as Preset };
  }

  const dailyMatch = /^(\d{1,2}) (\d{1,2}) \* \* \*$/.exec(cronExpression);
  if (dailyMatch) {
    return {
      ...fallback,
      preset: 'daily' as Preset,
      minute: Number(dailyMatch[1]),
      hour: Number(dailyMatch[2]),
    };
  }

  const weeklyMatch = /^(\d{1,2}) (\d{1,2}) \* \* (\d)$/.exec(cronExpression);
  if (weeklyMatch) {
    return {
      ...fallback,
      preset: 'weekly' as Preset,
      minute: Number(weeklyMatch[1]),
      hour: Number(weeklyMatch[2]),
      weekday: weeklyMatch[3] ?? DEFAULT_WEEKDAY,
    };
  }

  return {
    ...fallback,
    preset: 'custom' as Preset,
    customCron: cronExpression,
  };
}

// Refs
// Preset sub-inputs are UI-only: only `cron`/`timezone` are ever persisted on
// the node. They're seeded once from the current config so editing an
// existing schedule reopens on the right preset (see matchScheduleConfig).
const initialSchedule = matchScheduleConfig(props.node.data.config);
const preset = ref<Preset>(initialSchedule.preset);
const hour = ref(initialSchedule.hour);
const minute = ref(initialSchedule.minute);
const weekday = ref(initialSchedule.weekday);
const customCron = ref(initialSchedule.customCron);
const timezone = ref(
  props.node.data.config.kind === 'schedule'
    ? props.node.data.config.timezone
    : browserTimezone,
);

// Composables (continued: depends on refs above)
const timezoneOptions = Intl.supportedValuesOf('timeZone');

// Computed
const cron = computed(() =>
  preset.value === 'custom'
    ? customCron.value
    : buildPresetCron(preset.value, hour.value, minute.value, weekday.value),
);

const kind = computed({
  get: () => props.node.data.config.kind,
  set: (value: TriggerConfig['kind']) => {
    props.node.data.config =
      value === 'manual'
        ? { kind: 'manual' }
        : { kind: 'schedule', cron: cron.value, timezone: timezone.value };
  },
});

const timeOfDay = computed({
  get: () =>
    `${String(hour.value).padStart(2, '0')}:${String(minute.value).padStart(2, '0')}`,
  set: (value: string) => {
    const [newHour, newMinute] = value.split(':').map(Number);
    hour.value = newHour ?? 0;
    minute.value = newMinute ?? 0;
  },
});

const isCronValid = computed(() => isValidCronExpression(cron.value));

const nextOccurrences = computed(() => {
  if (!isCronValid.value) {
    return [];
  }
  try {
    return getNextCronOccurrences(cron.value, timezone.value, NEXT_RUN_COUNT);
  } catch {
    return [];
  }
});

const occurrenceFormatter = computed(
  () =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone.value,
    }),
);

// Hooks
// Keeps the stored config's cron/timezone in sync as the preset sub-inputs
// change. A manual trigger has no cron/timezone to keep in sync, so this is
// a no-op until `kind` is switched to 'schedule'.
watch([cron, timezone], ([newCron, newTimezone]) => {
  if (props.node.data.config.kind === 'schedule') {
    props.node.data.config.cron = newCron;
    props.node.data.config.timezone = newTimezone;
  }
});
</script>

<template>
  <div class="space-y-4">
    <div>
      <Label class="mb-2 block text-sm font-medium">{{
        t('workflow.trigger.kind.label')
      }}</Label>
      <Select v-model="kind">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="manual">{{
            t('workflow.trigger.kind.manual')
          }}</SelectItem>
          <SelectItem value="schedule">{{
            t('workflow.trigger.kind.schedule')
          }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <p v-if="kind === 'manual'" class="text-sm text-muted-foreground">
      {{ t('workflow.trigger.manualDescription') }}
    </p>

    <template v-else>
      <div>
        <Label class="mb-2 block text-sm font-medium">{{
          t('workflow.trigger.preset.label')
        }}</Label>
        <Select v-model="preset">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem
              v-for="presetOption in PRESETS"
              :key="presetOption"
              :value="presetOption"
            >
              {{ t(`workflow.trigger.preset.${presetOption}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="preset === 'daily' || preset === 'weekly'">
        <Label class="mb-2 block text-sm font-medium">{{
          t('workflow.trigger.time')
        }}</Label>
        <Input type="time" v-model="timeOfDay" />
      </div>

      <div v-if="preset === 'weekly'">
        <Label class="mb-2 block text-sm font-medium">{{
          t('workflow.trigger.weekday.label')
        }}</Label>
        <Select v-model="weekday">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="day in WEEKDAYS" :key="day" :value="String(day)">
              {{ t(`workflow.trigger.weekday.${day}`) }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="preset === 'custom'">
        <Label class="mb-2 block text-sm font-medium">{{
          t('workflow.trigger.cron.label')
        }}</Label>
        <Input v-model="customCron" placeholder="*/15 * * * *" />
        <p v-if="!isCronValid" class="mt-1 text-xs text-destructive">
          {{ t('workflow.trigger.cron.invalid') }}
        </p>
      </div>

      <div>
        <Label class="mb-2 block text-sm font-medium">{{
          t('workflow.trigger.timezone')
        }}</Label>
        <Select v-model="timezone">
          <SelectTrigger class="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="max-h-64">
            <SelectItem
              v-for="timezoneOption in timezoneOptions"
              :key="timezoneOption"
              :value="timezoneOption"
            >
              {{ timezoneOption }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        v-if="nextOccurrences.length"
        class="space-y-1 rounded-md border bg-muted/40 p-3"
      >
        <p class="text-xs font-medium text-muted-foreground">
          {{ t('workflow.trigger.nextRuns') }}
        </p>
        <ul class="space-y-0.5 text-xs">
          <li
            v-for="occurrence in nextOccurrences"
            :key="occurrence.toISOString()"
          >
            {{ occurrenceFormatter.format(occurrence) }}
          </li>
        </ul>
      </div>
    </template>
  </div>
</template>
