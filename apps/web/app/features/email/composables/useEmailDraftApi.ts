import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import { buildSendDraftFormData } from '~/features/email/lib/email-send-form-data';
import type {
  CreateEmailDraftRequest,
  EmailDraft,
  EmailDraftConflictResponse,
  EmailDraftListResponse,
  EmailDraftResponse,
  SendEmailDraftVariables,
  SendEmailResponse,
  TriggerEmailDraftRequest,
  UpdateEmailDraftRequest,
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
      $api<EmailDraftListResponse>('/email/draft', {
        method: 'GET',
        query: { threadId: toValue(threadId) },
        signal,
      }),
    enabled: () => !!toValue(threadId),
    refetchInterval: (query) =>
      hasGeneratingDraft(query.state.data) ? DRAFT_POLL_INTERVAL_MS : false,
  });
}

/**
 * [GET] /email/draft - omitting `threadId` returns every non-terminal draft
 * on the account. Drives both the Drafts pseudo-folder's row list and, via a
 * `threadId` lookup, the small "Draft" indicator on thread rows in every
 * other folder (EmailClient.vue).
 */
export function useGetAllDrafts() {
  const { $api } = useNuxtApp();
  return useQuery<EmailDraftListResponse>({
    queryKey: emailKeys.allDrafts(),
    queryFn: ({ signal }) =>
      $api<EmailDraftListResponse>('/email/draft', { method: 'GET', signal }),
    refetchInterval: (query) =>
      hasGeneratingDraft(query.state.data) ? DRAFT_POLL_INTERVAL_MS : false,
  });
}

/**
 * [GET] /email/draft/:draftId - the standalone `/mail/draft/:draftId` view
 * (new mail, no thread below it). 404 means the draft is gone (sent or
 * discarded elsewhere) - callers read `isError` for a "not found" state
 * rather than a toast; retries are disabled since a 404 won't turn into a
 * 200 on its own.
 */
export function useGetEmailDraft(draftId: MaybeRefOrGetter<string | null>) {
  const { $api } = useNuxtApp();
  return useQuery<EmailDraftResponse>({
    queryKey: emailKeys.draft(draftId as MaybeRefOrGetter<string>),
    queryFn: ({ signal }) =>
      $api<EmailDraftResponse>(`/email/draft/${toValue(draftId)}`, {
        method: 'GET',
        signal,
      }),
    enabled: () => !!toValue(draftId),
    retry: false,
  });
}

interface DraftInvalidationTarget {
  /** Omitted for `useTriggerEmailDraft`, whose 202 response carries no draft id to key a refetch on. */
  draftId?: string;
  /** Nullable because a `kind: 'new'` draft has no thread until it's sent. */
  threadId: string | null;
}

/**
 * Every draft mutation touches the same read models: the single-draft view
 * (only when the draft's own id is known), the thread's draft list (only
 * when the draft has a thread), and the account-wide `allDrafts` list that
 * backs both the Drafts pseudo-folder and the thread-row indicator.
 */
function invalidateDraftQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  { draftId, threadId }: DraftInvalidationTarget,
): void {
  if (draftId)
    queryClient.invalidateQueries({ queryKey: emailKeys.draft(draftId) });
  if (threadId)
    queryClient.invalidateQueries({ queryKey: emailKeys.drafts(threadId) });
  queryClient.invalidateQueries({ queryKey: emailKeys.allDrafts() });
}

interface FetchErrorWithStatus {
  status?: number;
  data?: unknown;
}

function hasConflictingDraft(
  data: unknown,
): data is EmailDraftConflictResponse {
  return typeof data === 'object' && data !== null && 'draft' in data;
}

/**
 * Reads the existing draft off a 409 from `POST /email/draft` (one active
 * draft per thread - docs/email/drafts-change-request.md, "API changes"), so
 * a caller can focus/scroll to it instead of surfacing the error as a toast.
 * Returns `null` for any other error, including a 409 whose body doesn't
 * match the assumed shape (see EmailDraftConflictResponse's doc comment).
 */
export function extractConflictingDraft(error: unknown): EmailDraft | null {
  const fetchError = error as FetchErrorWithStatus | undefined;
  if (fetchError?.status !== 409 || !hasConflictingDraft(fetchError.data))
    return null;
  return fetchError.data.draft;
}

/**
 * [POST] /email/draft - creates the local row for any of the five entry
 * points (new/reply/reply-all/forward/AI); the caller routes to or renders
 * the returned draft. A 409 (thread already has a non-terminal draft) is
 * deliberately not toasted here - callers use `extractConflictingDraft` to
 * recover the existing draft and handle it themselves.
 */
export function useCreateEmailDraft() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailDraftResponse, unknown, CreateEmailDraftRequest>({
    mutationFn: (body) =>
      $api<EmailDraftResponse>('/email/draft', { method: 'POST', body }),
    onSuccess: ({ draft }, { threadId }) =>
      invalidateDraftQueries(queryClient, {
        draftId: draft.id,
        threadId: threadId ?? null,
      }),
    onError: (error) => {
      if (extractConflictingDraft(error)) return;
      toast.error(extractErrorMessage(error, 'Failed to create draft'));
    },
  });
}

interface UpdateEmailDraftVariables extends UpdateEmailDraftRequest {
  draftId: string;
  /** Not sent to the API - only used locally to invalidate the right queries once the mutation settles. */
  threadId: string | null;
}

/**
 * [PATCH] /email/draft/:draftId - widened from its old content-only body to
 * the full editable set (docs/email/drafts-change-request.md, section 3):
 * recipients, subject, body, and the forwarded-attachment set, any subset of
 * which a caller can send. EmailDraftPanel.vue's autosave debounces calls
 * into this by ~1s and always sends the full snapshot (simpler than tracking
 * per-field dirtiness); EmailThreadView.vue's reply-all recipient seeding
 * sends just `{ cc }`.
 */
export function useUpdateEmailDraft() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailDraftResponse, unknown, UpdateEmailDraftVariables>({
    mutationFn: ({ draftId, threadId: _threadId, ...patch }) =>
      $api<EmailDraftResponse>(`/email/draft/${draftId}`, {
        method: 'PATCH',
        body: patch,
      }),
    onSuccess: (_, { draftId, threadId }) =>
      invalidateDraftQueries(queryClient, { draftId, threadId }),
    onError: (error) =>
      toast.error(extractErrorMessage(error, 'Failed to save draft')),
  });
}

interface DiscardEmailDraftVariables {
  draftId: string;
  /** Not sent to the API - only used locally to invalidate the right queries once the mutation settles. */
  threadId: string | null;
}

/** [POST] /email/draft/:draftId/discard */
export function useDiscardEmailDraft() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<EmailDraftResponse, unknown, DiscardEmailDraftVariables>({
    mutationFn: ({ draftId }) =>
      $api<EmailDraftResponse>(`/email/draft/${draftId}/discard`, {
        method: 'POST',
      }),
    onMutate: ({ draftId }) => {
      // Optimistically remove the draft from the list so it disappears from
      // the UI immediately, even before the server responds. If the discard
      // fails, we'll roll back to the previous state by invalidating the queries in onSettled.
      queryClient.setQueryData<EmailDraftListResponse | undefined>(
        emailKeys.drafts(draftId),
        (oldData) => {
          if (!oldData) return oldData;
          return {
            drafts: oldData.drafts.filter((draft) => draft.id !== draftId),
          };
        },
      );
    },
    onError: (error) =>
      toast.error(extractErrorMessage(error, 'Failed to discard draft')),
    onSettled: (_, __, { draftId, threadId }) =>
      invalidateDraftQueries(queryClient, { draftId, threadId }),
  });
}

interface SendEmailDraftMutationVariables extends SendEmailDraftVariables {
  /**
   * Not sent to the API (stripped before the request body is built) - only
   * used locally to invalidate the right thread caches. Null for a
   * `kind: 'new'` draft, which has no thread until this very send; the
   * response's own `threadId` covers invalidation in that case.
   */
  threadId: string | null;
}

/** [POST] /email/draft/:draftId/send - same multipart shape as /email/send. */
export function useSendEmailDraft() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<
    SendEmailResponse,
    unknown,
    SendEmailDraftMutationVariables
  >({
    mutationFn: ({ draftId, threadId: _threadId, ...input }) =>
      $api<SendEmailResponse>(`/email/draft/${draftId}/send`, {
        method: 'POST',
        body: buildSendDraftFormData(input),
      }),
    onSuccess: (result, { draftId, threadId }) => {
      invalidateDraftQueries(queryClient, {
        draftId,
        threadId: threadId ?? result.threadId,
      });
      queryClient.invalidateQueries({
        queryKey: emailKeys.thread(result.threadId),
      });
      queryClient.invalidateQueries({ queryKey: ['email', 'threads'] });
      toast.success('Email sent');
    },
    onError: (error) =>
      toast.error(extractErrorMessage(error, 'Failed to send draft')),
  });
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
    mutationFn: (body) =>
      $api<void>('/email/draft/trigger', { method: 'POST', body }),
    onSuccess: (_, { threadId }) =>
      invalidateDraftQueries(queryClient, { threadId }),
    onError: (error) =>
      toast.error(
        extractErrorMessage(error, 'Failed to start drafting a reply'),
      ),
  });
}
