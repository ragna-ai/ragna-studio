import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import { accountSyncRefetchIntervalMs, startAccountSyncForcePoll } from '~/features/email/lib/email-account-sync-poll';
import type {
  EmailAccount,
  EmailAccountStatusResponse,
  UpdateEmailAccountSettingsRequest,
} from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';

type QueryOpts = Partial<UseQueryOptions<EmailAccountStatusResponse>>;

/** [PATCH] /email/account/settings response. */
interface UpdateEmailAccountSettingsResponse {
  account: EmailAccountStatusResponse['account'];
}

/** [POST] /email/account/sync response (202, see useSyncEmailAccount below). */
interface SyncEmailAccountResponse {
  account: EmailAccount;
}

/**
 * [GET] /email/account - connection status, syncState, lastSyncedAt. The
 * worker (not any endpoint) flips syncState when it picks a sync job up, so
 * polling is the only way the UI learns a 'syncing' account settled back to
 * 'idle'/'error' - same pattern as the draft-generation poll in
 * useEmailDraftApi.ts. Also polls through the forced window a manual "Sync
 * now" opens (email-account-sync-poll.ts), since the trigger's own response
 * can't be trusted to already say 'syncing'.
 */
export function useGetEmailAccount(options: QueryOpts = {}) {
  const { $api } = useNuxtApp();
  return useQuery<EmailAccountStatusResponse>({
    queryKey: emailKeys.account(),
    queryFn: ({ signal }) => $api<EmailAccountStatusResponse>('/email/account', { method: 'GET', signal }),
    refetchInterval: (query) =>
      accountSyncRefetchIntervalMs(query.state.data?.account?.syncState, query.state.data?.account?.lastSyncedAt),
    ...options,
  });
}

export function useUpdateEmailAccountSettings() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<UpdateEmailAccountSettingsResponse, unknown, UpdateEmailAccountSettingsRequest>({
    mutationFn: (body) =>
      $api<UpdateEmailAccountSettingsResponse>('/email/account/settings', { method: 'PATCH', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.account() });
      toast.success('Email settings updated');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to update email settings'));
    },
  });
}

/**
 * [POST] /email/account/sync - "Sync now". Deduped server-side against an
 * already-queued/running cron sync (email-api's note), so this is safe to
 * fire even if a background sync is already in flight. The 202 response's
 * syncState AND lastSyncedAt are only an enqueue-time snapshot (the worker
 * flips/bumps them once it actually picks the job up and finishes, not this
 * endpoint) - written into the account cache regardless, and
 * `startAccountSyncForcePoll()` (seeded with this same pre-sync
 * `lastSyncedAt`, so the poll can detect a fast completion even if
 * 'syncing' is never observed) covers the gap until a real settle shows up
 * from the account query's own polling.
 */
export function useSyncEmailAccount() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<SyncEmailAccountResponse, unknown, void>({
    mutationFn: () => $api<SyncEmailAccountResponse>('/email/account/sync', { method: 'POST' }),
    onSuccess: ({ account }) => {
      // Opened *before* setQueryData below: writing the cache re-evaluates
      // useGetEmailAccount's refetchInterval synchronously (TanStack
      // dispatches a cache-update the same way a real fetch does), so the
      // window has to already be active for that first re-evaluation to
      // schedule a poll.
      startAccountSyncForcePoll(account.lastSyncedAt);
      queryClient.setQueryData<EmailAccountStatusResponse>(emailKeys.account(), (old) => ({
        connected: old?.connected ?? true,
        account,
      }));
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to start syncing'));
    },
  });
}

export function useDisconnectEmailAccount() {
  const { $api } = useNuxtApp();
  const queryClient = useQueryClient();
  return useMutation<void, unknown, void>({
    mutationFn: () => $api<void>('/email/account/disconnect', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email'] });
      toast.success('Gmail disconnected');
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, 'Failed to disconnect Gmail'));
    },
  });
}
