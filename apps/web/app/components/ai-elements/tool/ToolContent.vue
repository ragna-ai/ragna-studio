<script setup lang="ts">
import { CollapsibleContent } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'vue';

type ToolContentProps = InstanceType<typeof CollapsibleContent>['$props'];

interface Props extends /* @vue-ignore */ ToolContentProps {
  class?: HTMLAttributes['class'];
}

const props = defineProps<Props>();
</script>

<template>
  <CollapsibleContent
    :class="
      cn(
        'rounded-lg border bg-accent/45 text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2',
        props.class,
      )
    "
    v-bind="$attrs"
  >
    <slot />
  </CollapsibleContent>
</template>
