import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Alert } from './Alert.vue';
export { default as AlertAction } from './AlertAction.vue';
export { default as AlertDescription } from './AlertDescription.vue';
export { default as AlertTitle } from './AlertTitle.vue';

export const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr_auto] items-start gap-y-0.5 rounded-lg px-4 py-3 text-body has-[>[data-slot=alert-icon]]:grid-cols-[calc(var(--spacing)*4)_1fr_auto] has-[>[data-slot=alert-icon]]:gap-x-3 *:data-[slot=alert-icon]:mt-0.5 *:data-[slot=alert-icon]:size-4',
  {
    variants: {
      variant: {
        default: 'border bg-surface-subtle *:data-[slot=alert-icon]:text-icon',
        success: 'bg-status-ok-bg *:data-[slot=alert-icon]:text-status-ok-fg',
        warning:
          'bg-status-warn-bg *:data-[slot=alert-icon]:text-status-warn-fg',
        destructive:
          'bg-status-danger-bg *:data-[slot=alert-icon]:text-status-danger-fg',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type AlertVariants = VariantProps<typeof alertVariants>;
