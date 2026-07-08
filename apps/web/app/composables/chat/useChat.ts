import type { AsyncDataOptions } from '#app';
import { useDebounceFn } from '@vueuse/core';

export default function useChat() {
  const ac = new AbortController();
  const api = useApi();

  const page = ref<number>(1);
  const searchQuery = ref<string>('');

  onScopeDispose(() => ac.abort());

  const setSearchQuery = useDebounceFn((newSearchQuery: string) => {
    searchQuery.value = newSearchQuery;
  }, 300);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  async function createChat(assistantId: string) {
    return useApiFetch('/chat/create', {
      method: 'POST',
      body: {
        assistantId,
      },
      signal: ac.signal,
    });
  }

  function getAllChats(options: AsyncDataOptions<any> = {}) {
    return useAsyncData(
      `chats:${page.value}:${searchQuery.value}`,
      () =>
        api('/chat/all', {
          method: 'POST',
          body: {
            page: page.value,
            searchQuery: searchQuery.value,
          },
          signal: ac.signal,
        }),
      {
        watch: [page, searchQuery],
        ...options,
      },
    );
  }

  function getChat(chatId: string, options: AsyncDataOptions<any> = {}) {
    return useAsyncData(
      `chat:${chatId}`,
      () =>
        api(`/chat/${chatId}`, {
          method: 'GET',
          signal: ac.signal,
        }),
      options,
    );
  }

  function getRecentChat(options: AsyncDataOptions<any> = {}) {
    return useAsyncData(
      'recentChat',
      () =>
        api('/chat/recent', {
          method: 'GET',
          signal: ac.signal,
        }),
      options,
    );
  }

  function deleteChat(chatId: string) {
    return useApiFetch(`/chat/${chatId}`, {
      method: 'DELETE',
      signal: ac.signal,
    });
  }

  return {
    page,
    searchQuery,
    setPage,
    setSearchQuery,
    createChat,
    getChat,
    getAllChats,
    getRecentChat,
    deleteChat,
  };
}
