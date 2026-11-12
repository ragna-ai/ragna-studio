import type { ComputedRef, InjectionKey } from 'vue';

export { default as DropdownMenu } from './DropdownMenu.vue';

export { default as DropdownMenuCheckboxItem } from './DropdownMenuCheckboxItem.vue';
export { default as DropdownMenuContent } from './DropdownMenuContent.vue';
export { default as DropdownMenuGroup } from './DropdownMenuGroup.vue';
export { default as DropdownMenuItem } from './DropdownMenuItem.vue';
export { default as DropdownMenuLabel } from './DropdownMenuLabel.vue';
export { default as DropdownMenuRadioGroup } from './DropdownMenuRadioGroup.vue';
export { default as DropdownMenuRadioItem } from './DropdownMenuRadioItem.vue';
export { default as DropdownMenuSeparator } from './DropdownMenuSeparator.vue';
export { default as DropdownMenuShortcut } from './DropdownMenuShortcut.vue';
export { default as DropdownMenuSub } from './DropdownMenuSub.vue';
export { default as DropdownMenuSubContent } from './DropdownMenuSubContent.vue';
export { default as DropdownMenuSubTrigger } from './DropdownMenuSubTrigger.vue';
export { default as DropdownMenuTrigger } from './DropdownMenuTrigger.vue';
export { DropdownMenuPortal } from 'reka-ui';

export type DropdownMenuSize = 'default' | 'sm';

/** Lets items and sub triggers follow the `size` set on their `DropdownMenuContent`. */
export const DROPDOWN_MENU_SIZE_KEY: InjectionKey<
  ComputedRef<DropdownMenuSize>
> = Symbol('dropdown-menu-size');

export const dropdownMenuContentSizeClasses: Record<DropdownMenuSize, string> =
  {
    default: 'w-70 p-1.5',
    sm: 'w-auto min-w-32 p-1',
  };

/** Slot icons without their own `size-*` class follow the item size (`<Icon>` renders a span, not an svg). */
export const dropdownMenuItemSizeClasses: Record<DropdownMenuSize, string> = {
  default:
    "min-h-9 gap-2.5 px-2.5 text-body [&_svg:not([class*='size-'])]:size-4",
  sm: "min-h-8 gap-2 px-2 text-small [&_svg:not([class*='size-'])]:size-3.5 [&_.iconify:not([class*='size-'])]:size-3.5",
};
