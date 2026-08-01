import { defineStore } from 'pinia';

export const useNavSidebarStore = defineStore('nav-sidebar', () => {
  // Persisted so the label visibility survives reloads.
  const showLabels = useLocalStorage('nav-sidebar:show-labels', true);

  function toggleLabels() {
    showLabels.value = !showLabels.value;
  }

  return {
    showLabels,
    toggleLabels,
  };
});
