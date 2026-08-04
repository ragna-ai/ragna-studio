import { defineStore } from 'pinia';

export const useNavSidebarStore = defineStore('nav-sidebar', () => {
  // Persisted so the expand/collapse state survives reloads.
  const expanded = useLocalStorage('nav-sidebar:expanded', false);
  // Persisted account preference (set on the Account > Sidebar settings page):
  // whether the collapsed sidebar still shows labels under each icon.
  const showLabelsWhenCollapsed = useLocalStorage(
    'nav-sidebar:show-labels-when-collapsed',
    true,
  );

  function toggleExpanded() {
    expanded.value = !expanded.value;
  }

  return {
    expanded,
    showLabelsWhenCollapsed,
    toggleExpanded,
  };
});
