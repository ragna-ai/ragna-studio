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
  AgentMemoryResponse,
  AgentResponse,
  UpsertAgentRequest,
} from '~/features/agent/types';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

export const agentKeys = {
  all: ['agents'] as const,
  list: (
    page: MaybeRefOrGetter<number>,
    limit: MaybeRefOrGetter<number>,
    search: MaybeRefOrGetter<string>,
    scopeKey: MaybeRefOrGetter<string>,
  ) => ['agents', 'list', page, limit, search, scopeKey] as const,
  detail: (agentId: MaybeRefOrGetter<string>) =>
    ['agents', 'detail', agentId] as const,
  memory: (agentId: MaybeRefOrGetter<string>) =>
    ['agents', 'memory', agentId] as const,
  documents: (agentId: MaybeRefOrGetter<string>) =>
    ['agents', 'documents', agentId] as const,
};

type QueryOpts = Partial<UseQueryOptions<any>>;

/** Body ofetch attaches to a thrown error for a non-2xx JSON response. */
type FetchErrorWithData = { data?: { error?: string } };

function getErrorMessage(error: unknown, fallback: string): string {
  return (error as FetchErrorWithData | undefined)?.data?.error || fallback;
}

export function useGetAgent(
  agentId: MaybeRefOrGetter<string>,
  options: QueryOpts = {},
) {
  const api = useApi();
  return useQuery<AgentResponse>({
    queryKey: agentKeys.detail(agentId),
    queryFn: ({ signal }) =>
      api(`/agent/${toValue(agentId)}`, { method: 'GET', signal }),
    enabled: () => !!toValue(agentId),
    ...options,
  });
}

/** Unpaginated agent list for pickers (e.g. the workflow agent-node config). */
export function useGetAllAgents(options: QueryOpts = {}) {
  const api = useApi();
  return useQuery<AgentManyResponse>({
    queryKey: [...agentKeys.all, 'picker'],
    queryFn: ({ signal }) =>
      api('/agent', { method: 'GET', query: { page: 1, limit: 100 }, signal }),
    ...options,
  });
}

export function useUpsertAgent() {
  const api = useApi();
  const queryClient = useQueryClient();
  const workspaceScopeStore = useWorkspaceScopeStore();
  return useMutation<AgentResponse, unknown, UpsertAgentRequest>({
    mutationFn: (body) => {
      // Stamp the active workspace only when creating (no id yet) and a
      // specific workspace is active. Editing must not silently move an
      // agent; All and Unassigned both mean "no workspace" and send nothing
      // (docs/workspaces.md).
      const workspaceId = body.id
        ? null
        : workspaceScopeStore.createWorkspaceId;
      return api('/agent', {
        method: 'POST',
        body: workspaceId ? { ...body, workspaceId } : body,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
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
  const api = useApi();
  return useQuery<AgentMemoryResponse>({
    queryKey: agentKeys.memory(agentId),
    queryFn: ({ signal }) =>
      api(`/agent/${toValue(agentId)}/memory`, { method: 'GET', signal }),
    enabled: () => !!toValue(agentId),
    ...options,
  });
}

type UpdateAgentMemoryVariables = { agentId: string; content: string };

export function useUpdateAgentMemory() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<AgentMemoryResponse, unknown, UpdateAgentMemoryVariables>({
    mutationFn: ({ agentId, content }) =>
      api(`/agent/${agentId}/memory`, { method: 'PUT', body: { content } }),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.memory(agentId) });
      toast.success('Memory updated');
    },
    onError: () => {
      toast.error('Failed to update memory');
    },
  });
}

export function useDeleteAgent() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, string>({
    mutationFn: (agentId) => api(`/agent/${agentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all });
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

export function useGetAgentContextDocuments(agentId: MaybeRefOrGetter<string>) {
  const api = useApi();
  return useQuery<AgentContextDocumentManyResponse>({
    queryKey: agentKeys.documents(agentId),
    queryFn: ({ signal }) =>
      api(`/agent/${toValue(agentId)}/documents`, { method: 'GET', signal }),
    enabled: () => !!toValue(agentId),
    refetchInterval: (query) => {
      const hasPendingDocument = query.state.data?.documents.some(
        (document) => document.status === 'pending',
      );
      return hasPendingDocument ? AGENT_CONTEXT_DOCUMENT_POLL_INTERVAL_MS : false;
    },
  });
}

export interface UploadAgentContextDocumentsVariables {
  agentId: string;
  files: File[];
}

export function useUploadAgentContextDocuments() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<AgentContextDocumentManyResponse, unknown, UploadAgentContextDocumentsVariables>({
    mutationFn: ({ agentId, files }) => {
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));
      return api(`/agent/${agentId}/documents`, { method: 'POST', body: formData });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.documents(agentId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to upload documents'));
    },
  });
}

export interface RenameAgentContextDocumentVariables {
  agentId: string;
  documentId: string;
  name: string;
}

export function useRenameAgentContextDocument() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<AgentContextDocumentResponse, unknown, RenameAgentContextDocumentVariables>({
    mutationFn: ({ agentId, documentId, name }) =>
      api(`/agent/${agentId}/documents/${documentId}`, { method: 'PATCH', body: { name } }),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.documents(agentId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to rename document'));
    },
  });
}

export interface ReplaceAgentContextDocumentFileVariables {
  agentId: string;
  documentId: string;
  file: File;
}

export function useReplaceAgentContextDocumentFile() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<AgentContextDocumentResponse, unknown, ReplaceAgentContextDocumentFileVariables>({
    mutationFn: ({ agentId, documentId, file }) => {
      const formData = new FormData();
      formData.append('file', file);
      return api(`/agent/${agentId}/documents/${documentId}/file`, {
        method: 'PUT',
        body: formData,
      });
    },
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.documents(agentId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to replace document'));
    },
  });
}

export interface AgentContextDocumentIdVariables {
  agentId: string;
  documentId: string;
}

export function useRetryAgentContextDocument() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<AgentContextDocumentResponse, unknown, AgentContextDocumentIdVariables>({
    mutationFn: ({ agentId, documentId }) =>
      api(`/agent/${agentId}/documents/${documentId}/retry`, { method: 'POST' }),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.documents(agentId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to retry document'));
    },
  });
}

export function useDeleteAgentContextDocument() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, AgentContextDocumentIdVariables>({
    mutationFn: ({ agentId, documentId }) =>
      api(`/agent/${agentId}/documents/${documentId}`, { method: 'DELETE' }),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.documents(agentId) });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, 'Failed to delete document'));
    },
  });
}
