<script setup lang="ts">
import type { DropdownMenuItemProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { reactiveOmit } from '@vueuse/core';
import { DropdownMenuItem, useForwardProps } from 'reka-ui';
import { cn } from '@/lib/utils';
import {
  DROPDOWN_MENU_SIZE_KEY,
  dropdownMenuItemSizeClasses,
  type DropdownMenuSize,
} from '.';

const props = withDefaults(
  defineProps<
    DropdownMenuItemProps & {
      class?: HTMLAttributes['class'];
      inset?: boolean;
      variant?: 'default' | 'destructive';
    }
  >(),
  {
    variant: 'default',
  },
);

const delegatedProps = reactiveOmit(props, 'inset', 'variant', 'class');

const size = inject(
  DROPDOWN_MENU_SIZE_KEY,
  computed<DropdownMenuSize>(() => 'default'),
);

const forwardedProps = useForwardProps(delegatedProps);
</script>

<template>
  <DropdownMenuItem
    data-slot="dropdown-menu-item"
    :data-inset="inset ? '' : undefined"
    :data-variant="variant"
    v-bind="forwardedProps"
    :class="
      cn(
        dropdownMenuItemSizeClasses[size],
        'relative flex cursor-default items-center rounded-md py-0 outline-hidden select-none focus:bg-surface-subtle focus:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-status-danger-fg data-[variant=destructive]:focus:bg-status-danger-bg data-[variant=destructive]:focus:text-status-danger-fg [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=\'text-\'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:!text-status-danger-fg',
        props.class,
      )
    "
  >
    <slot />
  </DropdownMenuItem>
</template>
