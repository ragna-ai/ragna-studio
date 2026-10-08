<script setup lang="ts">
import { Trash2Icon } from '@lucide/vue';
import { useGetAllAgents } from '~/features/agent/composables/useAgentApi';
import {
  useMoveTask,
  useUpdateTask,
} from '~/features/task/composables/useTaskApi';
import {
  isTaskPriority,
  isTaskStatus,
  PRIORITY_OPTIONS,
  REMINDER_PRESETS,
  STATUS_COLUMNS,
} from '~/features/task/lib/task-display';
import type { TaskLabel, TaskWithDetails } from '~/features/task/types';

// shadcn's Select can't use an empty string as an item value (see
// AgentToolList's NO_DATASET), so "Unassigned" needs its own sentinel.
const NO_AGENT = '__none__';
const REMINDER_OFF = 'off';
const REMINDER_CUSTOM = 'custom';

// Props
const props = defineProps<{ task: TaskWithDetails; labels: TaskLabel[] }>();

// Emits
const emit = defineEmits<{ delete: [] }>();

// Composables
const { t, locale } = useI18n();
const { formatDate } = useDateTimeFormat();
const { data: agentsData } = useGetAllAgents();
const { mutate: updateTask } = useUpdateTask();
const { mutate: moveTask } = useMoveTask();

// Computed
const agents = computed(() => agentsData.value?.agents ?? []);
const selectedLabelIds = computed(
  () => new Set(props.task.labels.map((label) => label.id)),
);

// Reminder select's current value: a preset offset, the custom sentinel, or
// off. Disabled entirely without a due date.
const reminderSelectValue = computed(() => {
  if (props.task.remindDaysBeforeDue === null) {
    return REMINDER_OFF;
  }
  const isPreset = REMINDER_PRESETS.some(
    (preset) => preset.value === props.task.remindDaysBeforeDue,
  );
  return isPreset ? String(props.task.remindDaysBeforeDue) : REMINDER_CUSTOM;
});
const customDays = ref(
  props.task.remindDaysBeforeDue !== null ? props.task.remindDaysBeforeDue : 3,
);

// Functions
// The Select emits its generic AcceptableValue, so each setter narrows it
// through the shared type guards rather than a bare `as TaskStatus`/
// `as TaskPriority` cast.
function updateStatus(value: unknown) {
  if (!isTaskStatus(value)) {
    return;
  }
  moveTask({ taskId: props.task.id, status: value });
}

function updatePriority(value: unknown) {
  if (!isTaskPriority(value)) {
    return;
  }
  updateTask({ taskId: props.task.id, priority: value });
}

function updateDueDate(value: string | null) {
  updateTask({ taskId: props.task.id, dueDate: value });
}

function updateAssignee(value: string) {
  updateTask({
    taskId: props.task.id,
    assignedAgentId: value === NO_AGENT ? null : value,
  });
}

function toggleLabel(labelId: string, checked: boolean) {
  const next = checked
    ? [...selectedLabelIds.value, labelId]
    : [...selectedLabelIds.value].filter((id) => id !== labelId);
  updateTask({ taskId: props.task.id, labelIds: next });
}

function updateReminder(value: string) {
  if (value === REMINDER_OFF) {
    updateTask({ taskId: props.task.id, remindDaysBeforeDue: null });
    return;
  }
  if (value === REMINDER_CUSTOM) {
    updateTask({
      taskId: props.task.id,
      remindDaysBeforeDue: customDays.value,
    });
    return;
  }
  updateTask({ taskId: props.task.id, remindDaysBeforeDue: Number(value) });
}

function commitCustomDays() {
  if (reminderSelectValue.value !== REMINDER_CUSTOM) {
    return;
  }
  updateTask({ taskId: props.task.id, remindDaysBeforeDue: customDays.value });
}
</script>

<template>
  <aside class="flex w-72 shrink-0 flex-col gap-5 border-l p-4">
    <div class="space-y-1.5">
      <Label class="text-xs text-muted-foreground">{{
        t('common.status')
      }}</Label>
      <Select :model-value="task.status" @update:model-value="updateStatus">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="column in STATUS_COLUMNS"
            :key="column.value"
            :value="column.value"
          >
            {{ t(column.labelKey) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="space-y-1.5">
      <Label class="text-xs text-muted-foreground">{{
        t('task.property.priority')
      }}</Label>
      <Select :model-value="task.priority" @update:model-value="updatePriority">
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="option in PRIORITY_OPTIONS"
            :key="option.value"
            :value="option.value"
          >
            {{ t(option.labelKey) }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="space-y-1.5">
      <Label class="text-xs text-muted-foreground">{{
        t('task.property.dueDate')
      }}</Label>
      <DatePicker
        :model-value="task.dueDate"
        :placeholder="t('task.property.pickDueDate')"
        :clear-label="t('task.property.clearDueDate')"
        :locale="locale"
        :week-starts-on="1"
        :format-date="formatDate"
        @update:model-value="updateDueDate"
      />
    </div>

    <div class="space-y-1.5">
      <Label class="text-xs text-muted-foreground">{{
        t('task.property.assignee')
      }}</Label>
      <Select
        :model-value="task.assignedAgentId ?? NO_AGENT"
        @update:model-value="(v) => updateAssignee(String(v))"
      >
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="NO_AGENT">{{
            t('task.property.unassigned')
          }}</SelectItem>
          <SelectItem v-for="agent in agents" :key="agent.id" :value="agent.id">
            {{ agent.name }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div class="space-y-1.5">
      <Label class="text-xs text-muted-foreground">{{
        t('task.property.labels')
      }}</Label>
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" class="w-full justify-start font-normal">
            <span v-if="task.labels.length === 0" class="text-muted-foreground">
              {{ t('task.property.noLabels') }}
            </span>
            <span v-else class="flex flex-wrap gap-1">
              <Badge
                v-for="label in task.labels"
                :key="label.id"
                variant="outline"
                :style="{ borderColor: label.color, color: label.color }"
              >
                {{ label.name }}
              </Badge>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent class="w-56">
          <DropdownMenuCheckboxItem
            v-for="label in props.labels"
            :key="label.id"
            :model-value="selectedLabelIds.has(label.id)"
            @update:model-value="(checked) => toggleLabel(label.id, checked)"
          >
            <span
              class="mr-2 inline-block size-2.5 rounded-full"
              :style="{ backgroundColor: label.color }"
            />
            {{ label.name }}
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem v-if="props.labels.length === 0" disabled>
            {{ t('task.label.empty') }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>

    <div class="space-y-1.5">
      <Label class="text-xs text-muted-foreground">{{
        t('task.property.reminder')
      }}</Label>
      <Select
        :model-value="reminderSelectValue"
        :disabled="!task.dueDate"
        @update:model-value="(v) => updateReminder(String(v))"
      >
        <SelectTrigger class="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem :value="REMINDER_OFF">{{
            t('task.reminder.off')
          }}</SelectItem>
          <SelectItem
            v-for="preset in REMINDER_PRESETS"
            :key="preset.value"
            :value="String(preset.value)"
          >
            {{ t(preset.labelKey) }}
          </SelectItem>
          <SelectItem :value="REMINDER_CUSTOM">{{
            t('task.reminder.custom')
          }}</SelectItem>
        </SelectContent>
      </Select>
      <p v-if="!task.dueDate" class="text-xs text-muted-foreground">
        {{ t('task.reminder.needsDueDateHint') }}
      </p>
      <div
        v-else-if="reminderSelectValue === REMINDER_CUSTOM"
        class="flex items-center gap-2"
      >
        <Input
          type="number"
          min="0"
          class="h-8 w-20"
          :model-value="customDays"
          @update:model-value="(v) => (customDays = Number(v))"
          @change="commitCustomDays"
        />
        <span class="text-xs text-muted-foreground">{{
          t('task.reminder.daysBeforeSuffix')
        }}</span>
      </div>
    </div>

    <Separator />

    <Button
      variant="outline"
      class="hover:text-destructive"
      @click="emit('delete')"
    >
      <Trash2Icon class="mr-2 size-4 stroke-1.5" />
      {{ t('task.property.delete') }}
    </Button>
  </aside>
</template>
