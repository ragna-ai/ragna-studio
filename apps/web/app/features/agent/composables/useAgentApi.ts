import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import type {
  AgentContextDocumentManyResponse,
  AgentContextDocumentResponse,
  AgentManyResponse,
  AgentMemoryResponse,
  AgentResponse,
  CreateAgentRequest,
  UpdateAgentRequest,
} from '~/features/agent/types';
import { extractErrorMessage } from '~/lib/api-error';

type WorkspaceId = MaybeRefOrGetter<string>;

export const agentKeys = {
  all: (workspaceId: WorkspaceId) => ['agents', workspaceId] as const,
  list: (
    workspaceId: WorkspaceId,
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    search: MaybeRefOrGetter<string>,
  ) => ['agents', workspaceId, 'list', page, limit, search] as const,
  detail: (workspaceId: WorkspaceId, agentId: MaybeRefOrGetter<string>) =>
    ['agents', workspaceId, 'detail', agentId] as const,
  memory: (workspaceId: WorkspaceId, agentId: MaybeRefOrGetter<string>) =>
    ['agents', workspaceId, 'memory', agentId] as const,
  documents: (workspaceId: WorkspaceId, agentId: MaybeRefOrGetter<string>) =>
    ['agents', workspaceId, 'documents', agentId] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

function agentBasePath(workspaceId: WorkspaceId): string {
  return `/workspace/${toValue(workspaceId)}/agent`;
}

export function useGetAgent(
  agentId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<AgentResponse>({
    queryKey: agentKeys.detail(workspaceId, agentId),
    queryFn: ({ signal }) =>
      $api<AgentResponse>(`${agentBasePath(workspaceId)}/${toValue(agentId)}`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(workspaceId) && !!toValue(agentId),
    ...options,
  });
}

/** Unpaginated agent list for pickers (e.g. the workflow agent-node config). */
export function useGetAllAgents(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<AgentManyResponse>({
    queryKey: [...agentKeys.all(workspaceId), 'picker'],
    queryFn: ({ signal }) =>
      $api<AgentManyResponse>(agentBasePath(workspaceId), {
        method: 'GET',
        query: { page: 1, limit: 100 },
        signal,
      }),
    enabled: () => !!toValue(workspaceId),
    ...options,
  });
}

export function useCreateAgent() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<AgentResponse, unknown, CreateAgentRequest>({
    mutationFn: (body) =>
      $api<AgentResponse>(agentBasePath(workspaceId), { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all(workspaceId) });
      toast.success('Agent created');
    },
    onError: () => {
      toast.error('Failed to create agent');
    },
  });
}

interface UpdateAgentVariables extends UpdateAgentRequest {
  agentId: string;
}

export function useUpdateAgent() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<AgentResponse, unknown, UpdateAgentVariables>({
    mutationFn: ({ agentId, ...body }) =>
      $api<AgentResponse>(`${agentBasePath(workspaceId)}/${agentId}`, {
        method: 'PATCH',
        body,
      }),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all(workspaceId) });
      queryClient.invalidateQueries({
        queryKey: agentKeys.detail(workspaceId, agentId),
      });
      toast.success('Agent updated');
    },
    onError: () => {
      toast.error('Failed to update agent');
    },
  });
}

export function useGetAgentMemory(
  agentId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<AgentMemoryResponse>({
    queryKey: agentKeys.memory(workspaceId, agentId),
    queryFn: ({ signal }) =>
      $api<AgentMemoryResponse>(
        `${agentBasePath(workspaceId)}/${toValue(agentId)}/memory`,
        { method: 'GET', signal },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(agentId),
    ...options,
  });
}

type UpdateAgentMemoryVariables = { agentId: string; content: string };

export function useUpdateAgentMemory() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<AgentMemoryResponse, unknown, UpdateAgentMemoryVariables>({
    mutationFn: ({ agentId, content }) =>
      $api<AgentMemoryResponse>(
        `${agentBasePath(workspaceId)}/${agentId}/memory`,
        { method: 'PUT', body: { content } },
      ),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({
        queryKey: agentKeys.memory(workspaceId, agentId),
      });
      toast.success('Memory updated');
    },
    onError: () => {
      toast.error('Failed to update memory');
    },
  });
}

export function useDeleteAgent() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (agentId) =>
      $api<void>(`${agentBasePath(workspaceId)}/${agentId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all(workspaceId) });
      toast.success('Agent deleted');
    },
    onError: () => {
      toast.error('Failed to delete agent');
    },
  });
}

// Client-side mirror of the API's limits
// (apps/api/src/services/agent-context-document.service.ts), so invalid attachments
// are rejected before a request is even sent.
export const AGENT_CONTEXT_DOCUMENT_MAX_FILES = 10;
export const AGENT_CONTEXT_DOCUMENT_MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
export const AGENT_CONTEXT_DOCUMENT_ACCEPT = '.pdf,.docx,.txt,.md';

// While any listed document is still 'pending', poll for its terminal
// status. 'failed' is terminal and doesn't poll (docs/agent-context-documents.md).
const AGENT_CONTEXT_DOCUMENT_POLL_INTERVAL_MS = 2000;

function contextDocumentBasePath(
  workspaceId: WorkspaceId,
  agentId: MaybeRefOrGetter<string>,
): string {
  return `${agentBasePath(workspaceId)}/${toValue(agentId)}/context-document`;
}

export function useGetAgentContextDocuments(agentId: MaybeRefOrGetter<string>) {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  return useQuery<AgentContextDocumentManyResponse>({
    queryKey: agentKeys.documents(workspaceId, agentId),
    queryFn: ({ signal }) =>
      $api<AgentContextDocumentManyResponse>(
        contextDocumentBasePath(workspaceId, agentId),
        { method: 'GET', signal },
      ),
    enabled: () => !!toValue(workspaceId) && !!toValue(agentId),
    refetchInterval: (query) => {
      const hasPendingDocument = query.state.data?.documents.some(
        (document) => document.status === 'pending',
      );
      return hasPendingDocument
        ? AGENT_CONTEXT_DOCUMENT_POLL_INTERVAL_MS
        : false;
    },
  });
}

export interface UploadAgentContextDocumentsVariables {
  agentId: string;
  files: File[];
}

export function useUploadAgentContextDocuments() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<
    AgentContextDocumentManyResponse,
    unknown,
    UploadAgentContextDocumentsVariables
  >({
    mutationFn: ({ agentId, files }) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      return $api<AgentContextDocumentManyResponse>(
        contextDocumentBasePath(workspaceId, agentId),
        {
          method: 'POST',
          body: formData,
        },
      );
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({
        queryKey: agentKeys.documents(workspaceId, agentId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to upload documents'));
    },
  });
}

export interface RenameAgentContextDocumentVariables {
  agentId: string;
  documentId: string;
  name: string;
}

export function useRenameAgentContextDocument() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<
    AgentContextDocumentResponse,
    unknown,
    RenameAgentContextDocumentVariables
  >({
    mutationFn: ({ agentId, documentId, name }) =>
      $api<AgentContextDocumentResponse>(
        `${contextDocumentBasePath(workspaceId, agentId)}/${documentId}`,
        {
          method: 'PATCH',
          body: { name },
        },
      ),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({
        queryKey: agentKeys.documents(workspaceId, agentId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to rename document'));
    },
  });
}

export interface ReplaceAgentContextDocumentFileVariables {
  agentId: string;
  documentId: string;
  file: File;
}

export function useReplaceAgentContextDocumentFile() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<
    AgentContextDocumentResponse,
    unknown,
    ReplaceAgentContextDocumentFileVariables
  >({
    mutationFn: ({ agentId, documentId, file }) => {
      const formData = new FormData();
      formData.append('file', file);
      return $api<AgentContextDocumentResponse>(
        `${contextDocumentBasePath(workspaceId, agentId)}/${documentId}/file`,
        {
          method: 'PUT',
          body: formData,
        },
      );
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({
        queryKey: agentKeys.documents(workspaceId, agentId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to replace document'));
    },
  });
}

export interface AgentContextDocumentIdVariables {
  agentId: string;
  documentId: string;
}

export function useRetryAgentContextDocument() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<
    AgentContextDocumentResponse,
    unknown,
    AgentContextDocumentIdVariables
  >({
    mutationFn: ({ agentId, documentId }) =>
      $api<AgentContextDocumentResponse>(
        `${contextDocumentBasePath(workspaceId, agentId)}/${documentId}/retry`,
        {
          method: 'POST',
        },
      ),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({
        queryKey: agentKeys.documents(workspaceId, agentId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to retry document'));
    },
  });
}

export function useDeleteAgentContextDocument() {
  const { $api } = useNuxtApp();
  const workspaceId = useActiveWorkspaceId();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, AgentContextDocumentIdVariables>({
    mutationFn: ({ agentId, documentId }) =>
      $api<void>(
        `${contextDocumentBasePath(workspaceId, agentId)}/${documentId}`,
        {
          method: 'DELETE',
        },
      ),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({
        queryKey: agentKeys.documents(workspaceId, agentId),
      });
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to delete document'));
    },
  });
}
