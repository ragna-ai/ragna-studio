import { defineStore } from 'pinia';

const REMOVED_SHOW_LABELS_KEY = 'nav-sidebar:show-labels-when-collapsed';

export const useNavSidebarStore = defineStore('nav-sidebar', () => {
  const expanded = useLocalStorage('nav-sidebar:expanded', true);

  if (import.meta.client) {
    localStorage.removeItem(REMOVED_SHOW_LABELS_KEY);
  }

  function toggleExpanded() {
    expanded.value = !expanded.value;
  }

  return {
    expanded,
    toggleExpanded,
  };
});
