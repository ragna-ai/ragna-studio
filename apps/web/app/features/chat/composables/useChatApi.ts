import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import type { UIMessage } from 'ai';
import { toast } from 'vue-sonner';
import type { ChatAgent } from '~/features/chat/types';
import { extractErrorMessage } from '~/lib/api-error';

type WorkspaceId = MaybeRefOrGetter<string | null | undefined>;

export const chatKeys = {
  all: (workspaceId: WorkspaceId) => ['chats', workspaceId] as const,
  list: (
    workspaceId: WorkspaceId,
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    searchQuery: MaybeRefOrGetter<string>,
  ) => ['chats', workspaceId, 'list', page, limit, searchQuery] as const,
  detail: (workspaceId: WorkspaceId, chatId: MaybeRefOrGetter<string>) =>
    ['chats', workspaceId, 'detail', chatId] as const,
  history: (workspaceId: WorkspaceId) =>
    ['chats', workspaceId, 'history'] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

export interface ChatResponse {
  chat: {
    id: string;
    agent: ChatAgent;
    title: string;
    messages?: UIMessage[] | null;
    createdAt: string;
    updatedAt: string;
  };
}

interface NewChatBody {
  agentId?: string;
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
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<ChatResponse>({
    queryKey: chatKeys.detail(workspaceId, chatId),
    queryFn: ({ signal }) =>
      $api<ChatResponse>(
        `/workspace/${toValue(workspaceId)}/chat/${toValue(chatId)}`,
        {
          method: 'GET',
          signal,
        },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(chatId),
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

export function useGetChatHistory(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<ChatHistoryResponse>({
    queryKey: chatKeys.history(workspaceId),
    queryFn: ({ signal }) =>
      $api<ChatHistoryResponse>(`/workspace/${toValue(workspaceId)}/chat`, {
        method: 'GET',
        query: { page: 1, limit: 60 },
        signal,
      }),
    enabled: () => !!toValue(workspaceId),
    placeholderData: (prev: ChatHistoryResponse | undefined) => prev, // keep previous results while refetching
    ...options,
  });
}

export function useCreateChat() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<ChatResponse, unknown, NewChatBody>({
    mutationFn: (body) =>
      $api<ChatResponse>(`/workspace/${toValue(workspaceId)}/chat`, {
        method: 'POST',
        body,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all(workspaceId) });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to create chat'));
    },
  });
}

export function useCreateChatAndNavigate() {
  const { mutateAsync: createChat, ...rest } = useCreateChat();

  const createChatAndNavigate = async (agentId: string) => {
    if (!agentId) throw new Error('Cannot create new chat without agentId');
    const { chat } = await createChat({ agentId });
    if (!chat || !chat.id) throw new Error('Chat object empty');
    await navigateTo(`/chat/${chat.id}`);
  };

  return { createChatAndNavigate, ...rest };
}

interface UpdateChatTitleVariables {
  chatId: string;
  title: string;
}

export function useUpdateChatTitle() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<ChatResponse, unknown, UpdateChatTitleVariables>({
    mutationFn: ({ chatId, title }) =>
      $api<ChatResponse>(`/workspace/${toValue(workspaceId)}/chat/${chatId}`, {
        method: 'PATCH',
        body: { title },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all(workspaceId) });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to rename chat'));
    },
  });
}

export function useDeleteChat() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (chatId: string) =>
      $api<void>(`/workspace/${toValue(workspaceId)}/chat/${chatId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all(workspaceId) });
      toast.success('Chat deleted');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to delete chat'));
    },
  });
}
