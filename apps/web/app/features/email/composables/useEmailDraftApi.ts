import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import { buildSendDraftFormData } from '~/features/email/lib/email-send-form-data';
import type {
  EmailDraftListResponse,
  EmailDraftResponse,
  SendEmailDraftVariables,
  SendEmailResponse,
  TriggerEmailDraftRequest,
} from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';

// Draft generation runs as an async worker job (docs/email/prd.md,
// "Worker jobs"); polling is the only way the UI learns a `generating`
// draft turned `ready` (or failed back to a stale `generating` row).
const DRAFT_POLL_INTERVAL_MS = 2500;

function hasGeneratingDraft(data: EmailDraftListResponse | undefined): boolean {
  return data?.drafts.some((draft) => draft.status === 'generating') ?? false;
}

/** [GET] /email/draft?threadId=... */
export function useGetThreadDrafts(threadId: MaybeRefOrGetter<string | null>) {
  const { $api } = useNuxtApp();
  return useQuery<EmailDraftListResponse>({
    queryKey: emailKeys.drafts(threadId as MaybeRefOrGetter<string>),
    queryFn: ({ signal }) =>
      $api<EmailDraftListResponse>('/email/draft', { method: 'GET', query: { threadId: toValue(threadId) }, signal }),
    enabled: () => !!toValue(threadId),
    refetchInterval: (query) => (hasGeneratingDraft(query.state.data) ? DRAFT_POLL_INTERVAL_MS : false),
  });
}

/**
 * [GET] /email/draft/pending - account-wide drafts awaiting review, for the
 * "pending drafts" sidebar/page. NOTE (apps/api, listPendingEmailDraftsForUser
 * doc comment): the endpoint currently only returns `generating` rows, not
 * `ready` ones, even though it's meant to double as a review inbox for both.
 * Reported to team-lead; this composable is written against the intended
 * (generating + ready) shape so the UI needs no changes once that's fixed.
 */
export function useGetPendingDrafts() {
  const { $api } = useNuxtApp();
  return useQuery<EmailDraftListResponse>({
    queryKey: emailKeys.pendingDrafts(),
    queryFn: ({ signal }) => $api<EmailDraftListResponse>('/email/draft/pending', { method: 'GET', signal }),
    refetchInterval: (query) => (hasGeneratingDraft(query.state.data) ? DRAFT_POLL_INTERVAL_MS : false),
  });
}

function invalidateDraftQueries(queryClient: ReturnType<typeof useQueryClient>, threadId: string): void {
  queryClient.invalidateQueries({ queryKey: emailKeys.drafts(threadId) });
  queryClient.invalidateQueries({ queryKey: emailKeys.pendingDrafts() });
}

/**
 * [POST] /email/draft/trigger - manual "Draft with AI", enqueues and returns
 * 202. The explicit `$api<void>` generic is required here: left to
 * contextual inference from `useMutation<void, ...>`, TS tries to unify the
 * (fairly complex) overloaded `$api` return type against `void` and blows
 * its recursion budget (TS2321 "Excessive stack depth"). Every other
 * mutation in this file infers fine because its TData is a real response
 * shape, not `void`.
 */
export function useTriggerEmailDraft() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, TriggerEmailDraftRequest>({
    mutationFn: (body) => $api<void>('/email/draft/trigger', { method: 'POST', body }),
    onSuccess: (_, { threadId }) => invalidateDraftQueries(queryClient, threadId),
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to start drafting a reply')),
  });
}

interface UpdateEmailDraftVariables {
  draftId: string;
  /** Not sent to the API - only used locally to invalidate the right queries once the mutation settles. */
  threadId: string;
  content: string;
}

/** [PATCH] /email/draft/:draftId - saves the user's edits to a draft's markdown content. */
export function useUpdateEmailDraft() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailDraftResponse, unknown, UpdateEmailDraftVariables>({
    mutationFn: ({ draftId, content }) =>
      $api<EmailDraftResponse>(`/email/draft/${draftId}`, { method: 'PATCH', body: { content } }),
    onSuccess: (_, { threadId }) => invalidateDraftQueries(queryClient, threadId),
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to save draft')),
  });
}

interface DiscardEmailDraftVariables {
  draftId: string;
  /** Not sent to the API - only used locally to invalidate the right queries once the mutation settles. */
  threadId: string;
}

/** [POST] /email/draft/:draftId/discard */
export function useDiscardEmailDraft() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailDraftResponse, unknown, DiscardEmailDraftVariables>({
    mutationFn: ({ draftId }) => $api<EmailDraftResponse>(`/email/draft/${draftId}/discard`, { method: 'POST' }),
    onSuccess: (_, { threadId }) => {
      invalidateDraftQueries(queryClient, threadId);
      toast.success('Draft discarded');
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to discard draft')),
  });
}

interface SendEmailDraftMutationVariables extends SendEmailDraftVariables {
  /** Not sent to the API (stripped before the request body is built) - only used locally to invalidate the right queries once the mutation settles. */
  threadId: string;
}

/** [POST] /email/draft/:draftId/send - same multipart shape as /email/send. */
export function useSendEmailDraft() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<SendEmailResponse, unknown, SendEmailDraftMutationVariables>({
    mutationFn: ({ draftId, threadId: _threadId, ...input }) =>
      $api<SendEmailResponse>(`/email/draft/${draftId}/send`, {
        method: 'POST',
        body: buildSendDraftFormData(input),
      }),
    onSuccess: (result, { threadId }) => {
      invalidateDraftQueries(queryClient, threadId);
      queryClient.invalidateQueries({ queryKey: emailKeys.thread(threadId) });
      queryClient.invalidateQueries({ queryKey: ['email', 'threads'] });
      toast.success('Email sent');
    },
    onError: (error) => toast.error(extractErrorMessage(error, 'Failed to send draft')),
  });
}
