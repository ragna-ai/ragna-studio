import type { Ref } from 'vue';

const CLOSE_DELAY_MS = 150;

export interface HoverMenu {
  open: Readonly<Ref<boolean>>;
  setOpen: (value: boolean) => void;
  onTriggerEnter: (event: PointerEvent) => void;
  onTriggerLeave: (event: PointerEvent) => void;
  onContentEnter: (event: PointerEvent) => void;
  onContentLeave: (event: PointerEvent) => void;
}

/**
 * Opens a dropdown while the mouse hovers its trigger or content, and closes it shortly after
 * the mouse leaves both. Touch and keyboard keep the normal click behaviour.
 */
export function useHoverMenu(): HoverMenu {
  const open = ref(false);
  let isPointerOnTrigger = false;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;

  function cancelClose() {
    clearTimeout(closeTimer);
  }

  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(() => {
      open.value = false;
    }, CLOSE_DELAY_MS);
  }

  // A click on the trigger toggles the menu, which would close a menu the hover just opened.
  function setOpen(value: boolean) {
    if (!value && isPointerOnTrigger) return;
    open.value = value;
  }

  function onTriggerEnter(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    isPointerOnTrigger = true;
    cancelClose();
    open.value = true;
  }

  function onTriggerLeave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    isPointerOnTrigger = false;
    scheduleClose();
  }

  function onContentEnter(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    cancelClose();
  }

  function onContentLeave(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    scheduleClose();
  }

  onBeforeUnmount(cancelClose);

  return {
    open,
    setOpen,
    onTriggerEnter,
    onTriggerLeave,
    onContentEnter,
    onContentLeave,
  };
}
