<script lang="ts" setup>
import { cn } from '@/lib/utils';
import { getLocalTimeZone, today } from '@internationalized/date';
import { reactiveOmit, useVModel } from '@vueuse/core';
import type { CalendarRootEmits, CalendarRootProps, DateValue } from 'reka-ui';
import { CalendarRoot, useForwardPropsEmits } from 'reka-ui';
import type { HTMLAttributes, Ref } from 'vue';
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarHeading,
  CalendarNextButton,
  CalendarPrevButton,
} from '.';

const props = withDefaults(
  defineProps<CalendarRootProps & { class?: HTMLAttributes['class'] }>(),
  {
    modelValue: undefined,
    weekStartsOn: 1,
    fixedWeeks: true,
  },
);
const emits = defineEmits<CalendarRootEmits>();

const delegatedProps = reactiveOmit(props, 'class', 'placeholder');

const placeholder = useVModel(props, 'placeholder', emits, {
  passive: true,
  defaultValue: props.defaultPlaceholder ?? today(getLocalTimeZone()),
}) as Ref<DateValue>;

const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <CalendarRoot
    v-slot="{ grid, weekDays }"
    v-bind="forwarded"
    v-model:placeholder="placeholder"
    data-slot="calendar"
    :class="cn('p-3', props.class)"
  >
    <CalendarHeader>
      <CalendarPrevButton>
        <slot name="calendar-prev-icon" />
      </CalendarPrevButton>
      <CalendarHeading />
      <CalendarNextButton>
        <slot name="calendar-next-icon" />
      </CalendarNextButton>
    </CalendarHeader>

    <div class="mt-3 flex flex-col gap-y-4 sm:flex-row sm:gap-x-4 sm:gap-y-0">
      <CalendarGrid v-for="month in grid" :key="month.value.toString()">
        <CalendarGridHead>
          <CalendarGridRow>
            <CalendarHeadCell v-for="day in weekDays" :key="day">
              {{ day }}
            </CalendarHeadCell>
          </CalendarGridRow>
        </CalendarGridHead>
        <CalendarGridBody>
          <CalendarGridRow
            v-for="(weekDates, index) in month.rows"
            :key="`weekDate-${index}`"
            class="w-full"
          >
            <CalendarCell
              v-for="weekDate in weekDates"
              :key="weekDate.toString()"
              :date="weekDate"
            >
              <CalendarCellTrigger :day="weekDate" :month="month.value" />
            </CalendarCell>
          </CalendarGridRow>
        </CalendarGridBody>
      </CalendarGrid>
    </div>
  </CalendarRoot>
</template>
