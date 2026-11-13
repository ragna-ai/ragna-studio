<script setup lang="ts">
import PickerRow from '~/components/PickerRow.vue';
import TaskPropertyButton from '~/features/task/components/TaskPropertyButton.vue';
import { useGetTaskLabels } from '~/features/task/composables/useTaskLabelApi';
import { labelTone } from '~/features/task/lib/label-tone';
import { TONE_DOT_CLASS } from '~/lib/tone';
import { cn } from '~/lib/utils';

// Models
const selectedIds = defineModel<string[]>({ required: true });

// Emits
const emit = defineEmits<{ 'manage-labels': [] }>();

// Refs
const isOpen = ref(false);

// Composables
const { t } = useI18n();
const { data } = useGetTaskLabels();

// Computed
const labels = computed(() => data.value?.taskLabels ?? []);
const selectedLabels = computed(() =>
  labels.value.filter((label) => selectedIds.value.includes(label.id)),
);
const firstLabel = computed(() => selectedLabels.value[0]);
const extraCount = computed(() => selectedLabels.value.length - 1);

// Functions
function toggle(labelId: string) {
  selectedIds.value = selectedIds.value.includes(labelId)
    ? selectedIds.value.filter((id) => id !== labelId)
    : [...selectedIds.value, labelId];
}

function manageLabels() {
  isOpen.value = false;
  emit('manage-labels');
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <TaskPropertyButton
        :label="firstLabel?.name ?? t('task.property.labels')"
        :is-set="!!firstLabel"
        :suffix="extraCount > 0 ? `+${extraCount}` : undefined"
      >
        <template #leading>
          <span
            v-if="firstLabel"
            :class="
              cn('size-1.5 rounded-full', TONE_DOT_CLASS[labelTone(firstLabel)])
            "
            aria-hidden="true"
          />
          <Icon
            v-else
            name="hugeicons:tag-01"
            class="size-3.5 text-icon"
            aria-hidden="true"
          />
        </template>
      </TaskPropertyButton>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-60 overflow-hidden p-0">
      <Command>
        <CommandInput :placeholder="t('task.property.searchLabels')" />
        <CommandList class="max-h-64">
          <CommandEmpty>{{ t('task.label.empty') }}</CommandEmpty>
          <CommandGroup class="flex flex-col gap-0.5">
            <CommandItem
              v-for="label in labels"
              :key="label.id"
              :value="label.name"
              @select.prevent="toggle(label.id)"
            >
              <PickerRow
                :title="label.name"
                :selected="selectedIds.includes(label.id)"
              >
                <template #lead>
                  <span
                    :class="
                      cn(
                        'size-1.5 shrink-0 rounded-full',
                        TONE_DOT_CLASS[labelTone(label)],
                      )
                    "
                    aria-hidden="true"
                  />
                </template>
              </PickerRow>
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup>
            <CommandItem
              :value="t('task.label.manageTitle')"
              @select="manageLabels"
            >
              <Icon
                name="hugeicons:settings-02"
                class="size-4 text-icon"
                aria-hidden="true"
              />
              {{ t('task.label.manageTitle') }}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
