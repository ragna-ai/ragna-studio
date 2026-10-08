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

// Draft generation runs as an async worker job;
// polling is the only way the UI learns a `generating`
// draft turned `ready` (or failed back to a stale `generating` row).
const DRAFT_POLL_INTERVAL_MS = 2500;

function hasGeneratingDraft(data: EmailDraftListResponse | undefined): boolean {
  return data?.drafts.some((draft) => draft.status === 'generating') ?? false;
}

// Bridges the gap between POST /email/draft/trigger returning as soon as the
// job is enqueued (apps/api/src/services/email.service.ts,
// triggerEmailDraftForUser) and the worker actually creating the
// 'generating' row (apps/worker/src/mail/email-draft.service.ts,
// generateEmailDraft). Without this, useGetThreadDrafts's refetchInterval
// below is gated purely on drafts it already has: the refetch that fires
// right after the trigger call almost always lands before the worker's row
// exists, finds nothing, and - since nothing is generating - never polls
// again. The trigger button then just goes quiet with no loading state.
// Module-level so useTriggerEmailDraft (fired from EmailDraftTriggerButton)
// and useGetThreadDrafts (read from EmailThreadView, a different component)
// can share it.
const pendingDraftTriggerThreadIds = reactive(new Set<string>());
const pendingDraftTriggerTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
// Safety net for a job that finishes without ever creating a row (e.g. no
// agent configured on the account - generateEmailDraft returns early): stop
// polling for it even though no draft ever showed up.
const PENDING_DRAFT_TRIGGER_TIMEOUT_MS = 30_000;

function markDraftTriggerPending(threadId: string): void {
  pendingDraftTriggerThreadIds.add(threadId);
  clearTimeout(pendingDraftTriggerTimeouts.get(threadId));
  pendingDraftTriggerTimeouts.set(
    threadId,
    setTimeout(() => clearDraftTriggerPending(threadId), PENDING_DRAFT_TRIGGER_TIMEOUT_MS),
  );
}

function clearDraftTriggerPending(threadId: string): void {
  pendingDraftTriggerThreadIds.delete(threadId);
  const timeout = pendingDraftTriggerTimeouts.get(threadId);
  if (timeout) {
    clearTimeout(timeout);
    pendingDraftTriggerTimeouts.delete(threadId);
  }
}

/**
 * Reactive read of whether a "Draft with AI" trigger is still waiting on the
 * worker's row to show up. `useGetThreadDrafts`'s polling only surfaces a
 * draft once that row exists server-side; a view can watch this instead to
 * render an immediate placeholder for the gap between the click and the
 * first poll that actually finds something, rather than showing nothing.
 */
export function useIsDraftTriggerPending(threadId: MaybeRefOrGetter<string | null>) {
  return computed(() => {
    const id = toValue(threadId);
    return !!id && pendingDraftTriggerThreadIds.has(id);
  });
}

/** [GET] /email/draft?threadId=... */
export function useGetThreadDrafts(threadId: MaybeRefOrGetter<string | null>) {
  const { $api } = useNuxtApp();
  const query = useQuery<EmailDraftListResponse>({
    queryKey: emailKeys.drafts(threadId),
    queryFn: ({ signal }) =>
      $api<EmailDraftListResponse>('/email/draft', {
        method: 'GET',
        query: { threadId: toValue(threadId) },
        signal,
      }),
    enabled: () => !!toValue(threadId),
    refetchInterval: (query) => {
      if (hasGeneratingDraft(query.state.data)) return DRAFT_POLL_INTERVAL_MS;
      const id = toValue(threadId);
      return id && pendingDraftTriggerThreadIds.has(id) ? DRAFT_POLL_INTERVAL_MS : false;
    },
  });

  // TanStack only re-evaluates/re-arms `refetchInterval` around an actual
  // fetch on this query (onSubscribe, setOptions, or a state transition from
  // its own fetch) - flipping the reactive `pendingDraftTriggerThreadIds` set
  // in markDraftTriggerPending doesn't by itself make an already-idle
  // observer notice. Relying solely on the invalidateQueries call in
  // useTriggerEmailDraft's onSuccess is a race: on a fresh thread view it can
  // land before this query is done mounting, so polling silently never
  // starts until the next full remount. Watching the flag here and calling
  // `refetch()` directly closes that gap deterministically.
  watch(
    () => {
      const id = toValue(threadId);
      return !!id && pendingDraftTriggerThreadIds.has(id);
    },
    (isPending) => {
      if (isPending) query.refetch();
    },
  );

  // Once the worker's row shows up (in any status), the check above already
  // covers further polling - clear the pending flag so it doesn't also
  // outlive the row via the timeout.
  watch(query.data, (data) => {
    const id = toValue(threadId);
    if (id && data && data.drafts.length > 0) clearDraftTriggerPending(id);
  });

  return query;
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
    queryKey: emailKeys.draft(draftId),
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
 * draft per thread - specs/email/drafts-change-request.md, "API changes"), so
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
 * the full editable set:
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
    // Marked pending before the request even settles, not just on success:
    // the enqueue+row-creation race (see markDraftTriggerPending's doc
    // comment) means useGetThreadDrafts needs to already be polling by the
    // time onSuccess's invalidate fires its refetch.
    onMutate: ({ threadId }) => markDraftTriggerPending(threadId),
    onSuccess: (_, { threadId }) =>
      invalidateDraftQueries(queryClient, { threadId }),
    onError: (error, { threadId }) => {
      clearDraftTriggerPending(threadId);
      toast.error(
        extractErrorMessage(error, 'Failed to start drafting a reply'),
      );
    },
  });
}
