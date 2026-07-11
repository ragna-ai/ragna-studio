<script setup lang="ts">
import { InputGroupAddon } from '@/components/ui/input-group';
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

type PromptInputFooterProps = InstanceType<typeof InputGroupAddon>['$props'];

interface Props
  extends /* @vue-ignore */ Omit<PromptInputFooterProps, 'align'> {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();
</script>

<template>
  <InputGroupAddon
    align="block-end"
    :class="cn('justify-between gap-1 border', props.class)"
    v-bind="props"
  >
    <slot />
  </InputGroupAddon>
</template>
