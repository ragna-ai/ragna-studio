import { defineStore } from 'pinia';

/**
 * Views that can be rendered in the collapsible side panel. Add new entries
 * here as more features grow a panel view; keep SidePanelHost's registry in
 * sync (apps/web/app/components/SidePanelHost.vue).
 */
export type SidePanelView = 'chat-history';

export const useSidePanelStore = defineStore('side-panel', () => {
  // Persisted so the panel (and which view it shows) survives reloads.
  // '' means closed.
  const view = useLocalStorage<SidePanelView | ''>('side-panel:view', '');

  const isOpen = computed(() => view.value !== '');

  function open(nextView: SidePanelView) {
    view.value = nextView;
  }

  function close() {
    view.value = '';
  }

  function toggle(nextView: SidePanelView) {
    view.value = view.value === nextView ? '' : nextView;
  }

  return {
    view,
    isOpen,
    open,
    close,
    toggle,
  };
});
