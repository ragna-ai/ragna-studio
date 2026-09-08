import { defineStore } from 'pinia';

/** Chat search settings, persisted in localStorage across sessions. */
export const useChatSearchSettingsStore = defineStore(
  'chat-search-settings',
  () => {
    const caseSensitive = useLocalStorage('chat-search-case-sensitive', false);

    return {
      caseSensitive,
    };
  },
);
