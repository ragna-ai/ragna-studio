<script setup lang="ts">
import { Collapsible } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

type ToolProps = InstanceType<typeof Collapsible>['$props'];

interface Props extends /* @vue-ignore */ ToolProps {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();
</script>

<template>
  <Collapsible
    :class="cn('group not-prose mb-4 w-full', props.class)"
    v-bind="$attrs"
  >
    <slot />
  </Collapsible>
</template>
