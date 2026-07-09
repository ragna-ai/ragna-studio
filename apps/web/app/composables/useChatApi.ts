import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { useDebounceFn } from '@vueuse/core';
import type { UIMessage } from 'ai';
import { toast } from 'vue-sonner';

export const chatKeys = {
  all: ['chats'] as const,
  list: (page: MaybeRefOrGetter<number>, search: MaybeRefOrGetter<string>) =>
    ['chats', 'list', page, search] as const,
  detail: (chatId: MaybeRefOrGetter<string>) =>
    ['chats', 'detail', chatId] as const,
  recent: () => ['chats', 'recent'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

interface Chat {
  id: string;
  assistantId: string;
  messages: UIMessage[];
  createdAt: string;
  updatedAt: string;
}

interface NewChat {
  assistantId: string;
}

export default function useChatApi() {
  const api = useApi();
  const queryClient = useQueryClient();

  const page = ref<number>(1);
  const searchQuery = ref<string>('');

  const setSearchQuery = useDebounceFn((newSearchQuery: string) => {
    searchQuery.value = newSearchQuery;
  }, 300);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function getAllChats(options: QueryOpts = {}) {
    return useQuery<Chat[]>({
      queryKey: chatKeys.list(page, searchQuery),
      queryFn: ({ signal }) =>
        api('/chat', {
          method: 'GET',
          query: { page: page.value, searchQuery: searchQuery.value },
          signal,
        }),
      placeholderData: (prev: Chat[] | undefined) => prev, // keep previous results while refetching
      ...options,
    });
  }

  function getChat(chatId: MaybeRefOrGetter<string>, options: QueryOpts = {}) {
    return useQuery<Chat>({
      queryKey: chatKeys.detail(chatId),
      queryFn: ({ signal }) =>
        api(`/chat/${toValue(chatId)}`, { method: 'GET', signal }),
      enabled: () => !!toValue(chatId),
      ...options,
    });
  }

  function getRecentChat(options: QueryOpts = {}) {
    return useQuery<Chat>({
      queryKey: chatKeys.recent(),
      queryFn: ({ signal }) => api('/chat/recent', { method: 'GET', signal }),
      ...options,
    });
  }

  function createChat() {
    return useMutation<Chat, unknown, NewChat>({
      mutationFn: (body: NewChat) => api('/chat', { method: 'POST', body }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: chatKeys.all });
        toast.success('Chat created');
      },
      onError: () => {
        toast.error('Failed to create chat');
      },
    });
  }

  function deleteChat() {
    return useMutation<void, unknown, string>({
      mutationFn: (chatId: string) =>
        api(`/chat/${chatId}`, { method: 'DELETE' }),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: chatKeys.all });
        toast.success('Chat deleted');
      },
      onError: () => {
        toast.error('Failed to delete chat');
      },
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
