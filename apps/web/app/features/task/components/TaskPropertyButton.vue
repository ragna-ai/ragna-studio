<script setup lang="ts">
import { Button } from '~/components/ui/button';
import { cn } from '~/lib/utils';

interface TaskPropertyButtonProps {
  variant?: 'outline' | 'ghost';
  label: string;
  isSet?: boolean;
  /** Extra count shown after the label, e.g. "+2". */
  suffix?: string;
}

withDefaults(defineProps<TaskPropertyButtonProps>(), {
  variant: 'outline',
  isSet: false,
  suffix: undefined,
});
</script>

<template>
  <Button
    :variant="variant"
    size="sm"
    type="button"
    class="gap-1.5 pr-2.5 font-normal"
  >
    <template v-if="$slots.leading" #leading>
      <slot name="leading" />
    </template>
    <span :class="cn(isSet ? 'text-foreground' : 'text-muted-foreground')">{{
      label
    }}</span>
    <span v-if="suffix" class="text-muted-foreground">{{ suffix }}</span>
  </Button>
</template>
