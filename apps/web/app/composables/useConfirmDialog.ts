export interface ConfirmDialogOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
}

interface ConfirmDialogState {
  open: boolean;
  options: ConfirmDialogOptions;
  resolve: ((value: boolean) => void) | null;
}

const state = ref<ConfirmDialogState>({
  open: false,
  options: { title: '' },
  resolve: null,
});

export function useConfirmDialog() {
  function confirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise((resolve) => {
      state.value = { open: true, options, resolve };
    });
  }

  function onConfirm() {
    state.value.resolve?.(true);
    state.value.resolve = null;
    state.value.open = false;
  }

  function onCancel() {
    state.value.resolve?.(false);
    state.value.resolve = null;
    state.value.open = false;
  }

  return { state, confirm, onConfirm, onCancel };
}
