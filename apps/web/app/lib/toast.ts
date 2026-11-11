import { toast as sonner, type ExternalToast } from 'vue-sonner';

type ToastMessage = Parameters<typeof sonner.success>[0];

const ERROR_DEFAULTS: ExternalToast = {
  duration: Infinity,
  closeButton: true,
};

export const toast = {
  success: (message: ToastMessage, options?: ExternalToast) =>
    sonner.success(message, options),
  error: (message: ToastMessage, options?: ExternalToast) =>
    sonner.error(message, { ...ERROR_DEFAULTS, ...options }),
};
