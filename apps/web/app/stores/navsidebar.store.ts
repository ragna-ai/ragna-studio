import { defineStore } from 'pinia';

const NARROW_WINDOW_PX = 1024;
const REMOVED_SHOW_LABELS_KEY = 'nav-sidebar:show-labels-when-collapsed';

export const useNavSidebarStore = defineStore('nav-sidebar', () => {
  const startsExpanded = !(
    import.meta.client && window.innerWidth < NARROW_WINDOW_PX
  );
  const expanded = useLocalStorage('nav-sidebar:expanded', startsExpanded, {
    writeDefaults: false,
  });

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
