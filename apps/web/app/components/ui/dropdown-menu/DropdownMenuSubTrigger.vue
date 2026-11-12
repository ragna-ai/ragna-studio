<script setup lang="ts">
import type { DropdownMenuSubTriggerProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { DropdownMenuSubTrigger, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';
import {
  DROPDOWN_MENU_SIZE_KEY,
  dropdownMenuItemSizeClasses,
  type DropdownMenuSize,
} from '.';

const props = defineProps<
  DropdownMenuSubTriggerProps & {
    class?: HTMLAttributes['class'];
    inset?: boolean;
  }
>();

const delegatedProps = reactiveOmit(props, 'class', 'inset');
const size = inject(
  DROPDOWN_MENU_SIZE_KEY,
  computed<DropdownMenuSize>(() => 'default'),
);

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <DropdownMenuSubTrigger
    data-slot="dropdown-menu-sub-trigger"
    v-bind="forwardedProps"
    :data-inset="inset ? '' : undefined"
    :class="
      cn(
        dropdownMenuItemSizeClasses[size],
        'relative flex cursor-default items-center rounded-md py-0 outline-hidden select-none focus:bg-surface-subtle focus:text-foreground data-[state=open]:bg-surface-subtle data-[state=open]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'text-\'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:!text-destructive',
        props.class,
      )
    "
  >
    <slot />
    <Icon
      name="hugeicons:arrow-right-01"
      class="ml-auto size-4 shrink-0 text-icon"
    />
  </DropdownMenuSubTrigger>
</template>
