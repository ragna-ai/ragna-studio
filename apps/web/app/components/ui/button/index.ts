import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Button } from './Button.vue';

/**
 * Slot icons without their own `size-*` class follow the button. `@nuxt/icon` renders
 * `<Icon>` as `<span class="iconify">`, not an `<svg>`, so every rule names both.
 * Class names stay literal so Tailwind can scan them.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-body font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_.iconify:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60',
        outline:
          'border bg-background shadow-xs hover:bg-surface-subtle dark:bg-input/30 dark:border-input dark:hover:bg-input/50',
        ghost:
          'hover:bg-surface-subtle data-[state=open]:bg-surface-subtle aria-expanded:bg-surface-subtle dark:hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 gap-1 px-2.5 text-small',
        lg: 'h-10 px-4',
        icon: 'size-8',
        'icon-sm': 'size-7',
        'icon-xs':
          "size-6 rounded-sm [&_svg:not([class*='size-'])]:size-3.5 [&_.iconify:not([class*='size-'])]:size-3.5",
        'icon-2xs':
          "size-5 rounded-sm [&_svg:not([class*='size-'])]:size-3 [&_.iconify:not([class*='size-'])]:size-3",
        'icon-lg': 'size-10',
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
export type ButtonVariants = VariantProps<typeof buttonVariants>;

type ButtonSize = NonNullable<ButtonVariants['size']>;

export const buttonIconClasses: Record<ButtonSize, string> = {
  default: 'size-4',
  sm: 'size-4',
  lg: 'size-4',
  icon: 'size-4',
  'icon-sm': 'size-4',
  'icon-xs': 'size-3.5',
  'icon-2xs': 'size-3',
  'icon-lg': 'size-4',
};
