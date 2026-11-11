<script setup lang="ts">
import type { TabsListProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { TabsList } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = withDefaults(
  defineProps<
    TabsListProps & {
      class?: HTMLAttributes['class'];
      size?: 'default' | 'sm';
    }
  >(),
  { size: 'default' },
);

const delegatedProps = reactiveOmit(props, 'class', 'size');
</script>

<template>
  <TabsList
    data-slot="tabs-list"
    :data-size="size"
    v-bind="delegatedProps"
    :class="
      cn(
        'group/tabs-list inline-flex h-8 w-fit items-center justify-center rounded-lg bg-chip p-0.75 text-muted-foreground data-[size=sm]:h-7 data-[size=sm]:rounded-md data-[size=sm]:p-0.5',
        props.class,
      )
    "
  >
    <slot />
  </TabsList>
</template>
