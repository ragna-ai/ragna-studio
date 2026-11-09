import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Toggle } from './Toggle.vue';

export const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md text-body font-medium whitespace-nowrap transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          'bg-transparent hover:bg-surface-subtle data-[state=on]:bg-surface-subtle',
        outline:
          'border bg-background shadow-xs hover:bg-surface-subtle data-[state=on]:bg-surface-subtle',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 gap-1 px-2.5 text-small',
        lg: 'h-10 px-4',
      },
      leading: {
        true: '',
        false: '',
      },
    },
    compoundVariants: [
      { size: 'default', leading: true, class: 'pl-2.5' },
      { size: 'sm', leading: true, class: 'pl-2' },
    ],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ToggleVariants = VariantProps<typeof toggleVariants>;
