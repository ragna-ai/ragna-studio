import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import type { UIMessage } from 'ai';
import { toast } from 'vue-sonner';
import { useActiveWorkspace } from '~/features/workspace/composables/useActiveWorkspace';

export const chatKeys = {
  all: ['chats'] as const,
  list: (
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    search: MaybeRefOrGetter<string>,
    workspaceId: MaybeRefOrGetter<string | null>,
  ) => ['chats', 'list', page, limit, search, workspaceId] as const,
  detail: (chatId: MaybeRefOrGetter<string>) =>
    ['chats', 'detail', chatId] as const,
  recent: () => ['chats', 'recent'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export interface ChatResponse {
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
  // Set internally from the active workspace in useCreateChat; callers never
  // pass this themselves.
  workspaceId?: string | null;
}

export interface ChatHistoryItem {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  agent: {
    id: string;
    name: string;
    aiModel: {
      id: string;
      provider: string;
      displayName: string;
    };
  };
}

export interface ChatHistoryResponse {
  chats: ChatHistoryItem[];
  meta: { totalCount: number };
}

export function useGetChat(
  chatId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  return useQuery<ChatResponse>({
    queryKey: chatKeys.detail(chatId),
    queryFn: ({ signal }) =>
      api(`/chat/${toValue(chatId)}`, { method: 'GET', signal }),
    enabled: () => !!toValue(chatId),
    // Messages change outside vue-query via the AI SDK stream, and the
    // consumer renders the first snapshot only, so never serve cached data.
    staleTime: 0,
    gcTime: 0,
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

export function useGetRecentChat(options: QueryOpts = {}) {
  const api = useApi();
  return useQuery<ChatResponse>({
    queryKey: chatKeys.recent(),
    queryFn: ({ signal }) => api('/chat/recent', { method: 'GET', signal }),
    ...options,
  });
}

export function useCreateChat() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { activeWorkspaceId } = useActiveWorkspace();
  return useMutation<ChatResponse, unknown, NewChatBody>({
    mutationFn: (body) =>
      api('/chat', {
        method: 'POST',
        body: { ...body, workspaceId: activeWorkspaceId.value },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all });
      // toast.success('Chat created');
    },
    onError: () => {
      toast.error('Failed to create chat');
    },
  });
}

export function useDeleteChat() {
  const api = useApi();
  const queryClient = useQueryClient();
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
