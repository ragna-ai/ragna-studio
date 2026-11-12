import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Empty } from './Empty.vue';
export { default as EmptyContent } from './EmptyContent.vue';
export { default as EmptyDescription } from './EmptyDescription.vue';
export { default as EmptyHeader } from './EmptyHeader.vue';
export { default as EmptyMedia } from './EmptyMedia.vue';
export { default as EmptyTitle } from './EmptyTitle.vue';

export const emptyVariants = cva(
  'group/empty mx-auto flex w-full min-w-0 max-w-100 flex-col items-center justify-center text-balance text-center',
  {
    variants: {
      size: {
        default: 'gap-4 py-8',
        sm: 'gap-2 py-6',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export type EmptyVariants = VariantProps<typeof emptyVariants>;

export const emptyMediaVariants = cva(
  'flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        icon: "size-10 rounded-md bg-chip text-icon [&_svg:not([class*='size-'])]:size-5 [&_.iconify:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type EmptyMediaVariants = VariantProps<typeof emptyMediaVariants>;
