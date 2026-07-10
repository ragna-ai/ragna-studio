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
  list: (
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    search: MaybeRefOrGetter<string>,
  ) => ['chats', 'list', page, limit, search] as const,
  detail: (chatId: MaybeRefOrGetter<string>) =>
    ['chats', 'detail', chatId] as const,
  recent: () => ['chats', 'recent'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

interface ChatResponse {
  chat: {
    id: string;
    agentId: string;
    title: string;
    messages?: UIMessage[] | null;
    createdAt: string;
    updatedAt: string;
  };
}

interface NewChatBody {
  agentId?: string;
}

export default function useChatApi() {
  const api = useApi();
  const queryClient = useQueryClient();

  const page = ref<number>(1);
  const limit = ref<number>(10);
  const searchQuery = ref<string>('');

  const setSearchQuery = useDebounceFn((newSearchQuery: string) => {
    searchQuery.value = newSearchQuery;
  }, 300);

  function setPage(newPage: number) {
    page.value = newPage;
  }

  function getAllChats(options: QueryOpts = {}) {
    return useQuery<ChatResponse[]>({
      queryKey: chatKeys.list(page, limit, searchQuery),
      queryFn: ({ signal }) =>
        api('/chat', {
          method: 'GET',
          query: {
            page: page.value,
            limit: limit.value,
            searchQuery: searchQuery.value,
          },
          signal,
        }),
      placeholderData: (prev: ChatResponse[] | undefined) => prev, // keep previous results while refetching
      ...options,
    });
  }

  function getChat(chatId: MaybeRefOrGetter<string>, options: QueryOpts = {}) {
    return useQuery<ChatResponse>({
      queryKey: chatKeys.detail(chatId),
      queryFn: ({ signal }) =>
        api(`/chat/${toValue(chatId)}`, { method: 'GET', signal }),
      enabled: () => !!toValue(chatId),
      // Collapse an empty message list to null at the boundary.
      select: (data: ChatResponse) => ({
        ...data,
        chat: {
          ...data.chat,
          messages: data.chat.messages?.length ? data.chat.messages : undefined,
        },
      }),
      ...options,
    });
  }

  function getRecentChat(options: QueryOpts = {}) {
    return useQuery<ChatResponse>({
      queryKey: chatKeys.recent(),
      queryFn: ({ signal }) => api('/chat/recent', { method: 'GET', signal }),
      ...options,
    });
  }

  function createChat() {
    return useMutation<ChatResponse, unknown, NewChatBody>({
      mutationFn: (body) => api('/chat', { method: 'POST', body }),
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
