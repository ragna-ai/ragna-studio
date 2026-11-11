import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Avatar } from './Avatar.vue';
export { default as AvatarFallback } from './AvatarFallback.vue';
export { default as AvatarImage } from './AvatarImage.vue';

export const avatarVariants = cva(
  'group/avatar relative flex shrink-0 overflow-hidden rounded-full',
  {
    variants: {
      size: {
        default: 'size-8',
        sm: 'size-6',
        xs: 'size-5',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  },
);

export type AvatarVariants = VariantProps<typeof avatarVariants>;
