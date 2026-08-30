import { useMutation, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { useSyncEmailAccount } from '~/features/email/composables/useEmailAccountApi';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import type { EmailAccount } from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';

// Sensitive Gmail scope requested only when a user opts into the email
// client (docs/email/prd.md, "Auth and account connection"): the plain
// Google sign-in provider never asks for this, so most users never see the
// sensitive-scope consent screen.
export const GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

// The callback URL round-trips through this query param so the mail page
// knows to call POST /email/account/connect once control returns from
// Google, instead of firing that call on every unrelated page load.
export const GMAIL_CONNECT_CALLBACK_PARAM = 'gmailConnect';

// Same round-trip mechanism as GMAIL_CONNECT_CALLBACK_PARAM, for the
// reauth_required repair flow (email-sync.service.ts's isAuthGmailError):
// the `email_accounts` row already exists, so control returning from Google
// re-triggers `POST /email/account/sync` instead of `/connect` (which 400s
// on an already-connected account, email.service.ts's connectEmailAccount).
export const GMAIL_RECONNECT_CALLBACK_PARAM = 'gmailReconnect';

/** [POST] /email/account/connect response (email.controller.ts: `c.json({ account }, StatusCodes.CREATED)`). */
interface ConnectEmailAccountResponse {
  account: EmailAccount;
}

/**
 * Owns the two-step Gmail connect flow (mirrors
 * ~/features/user/composables/useUserSocialAccounts.ts's linkSocial usage):
 * (1) `linkSocial()` with the gmail.modify scope, which redirects the
 * browser to Google and back, then (2) `POST /email/account/connect`, which
 * turns that link into an `email_accounts` row. Step 2 is a separate call
 * (not part of linkSocial's own callback) because better-auth's redirect
 * lands back on a fresh page load with no callback hook of its own; the mail
 * page detects the return via `GMAIL_CONNECT_CALLBACK_PARAM` and triggers it.
 *
 * The reconnect variant (startReconnect/finishReconnect) reuses the exact
 * same `linkSocial()` call - auth.ts's google provider sends
 * `accessType: 'offline'` + `prompt: 'consent'` on every authorization, so
 * re-consenting reissues a refresh token for the same, already-linked
 * account (accountLinking is enabled in auth.ts) - but finishes by
 * re-enqueuing a sync instead of creating a second `email_accounts` row.
 */
export function useEmailConnectFlow() {
  const authClient = useAuth();
  const queryClient = useQueryClient();

  function linkGoogle(returnPath: string, callbackParam: string) {
    const appOrigin = window.location.origin;
    return authClient.linkSocial({
      provider: 'google',
      scopes: [GMAIL_MODIFY_SCOPE],
      callbackURL: `${appOrigin}${returnPath}?${callbackParam}=1`,
    });
  }

  const linkGoogleMutation = useMutation({
    mutationFn: (returnPath: string) => linkGoogle(returnPath, GMAIL_CONNECT_CALLBACK_PARAM),
    onSuccess: ({ error }) => {
      // On success the client redirects the browser to Google, so there is
      // nothing left to update locally here.
      if (error) toast.error('Failed to start connecting Gmail');
    },
    onError: () => toast.error('Failed to start connecting Gmail'),
  });

  const relinkGoogleMutation = useMutation({
    mutationFn: (returnPath: string) => linkGoogle(returnPath, GMAIL_RECONNECT_CALLBACK_PARAM),
    onSuccess: ({ error }) => {
      if (error) toast.error('Failed to start reconnecting Gmail');
    },
    onError: () => toast.error('Failed to start reconnecting Gmail'),
  });

  const connectAccountMutation = useMutation<ConnectEmailAccountResponse, unknown, void>({
    mutationFn: () => useNuxtApp().$api<ConnectEmailAccountResponse>('/email/account/connect', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.account() });
      toast.success('Gmail connected');
    },
    onError: (error) => {
      // A 400 here almost always means the Google link is missing or lacks
      // gmail.modify (email-provider.service.ts's assertGmailScope); the
      // connect prompt stays visible either way so the user can retry.
      toast.error(extractErrorMessage(error, 'Failed to connect Gmail. Try reconnecting Google'));
    },
  });

  // Reuses the same "Sync now" mutation the sidebar button fires
  // (useEmailAccountApi.ts) rather than a second hand-rolled POST
  // /email/account/sync - that composable already seeds the account cache
  // from the response and opens the account query's forced polling window
  // (email-account-sync-poll.ts), which is what lets the UI actually observe
  // this sync settle instead of waiting on the plain 3s "syncing" poll.
  const { mutateAsync: syncAccount } = useSyncEmailAccount();

  return {
    startConnect: (returnPath: string) => linkGoogleMutation.mutate(returnPath),
    isLinking: linkGoogleMutation.isPending,
    finishConnect: () => connectAccountMutation.mutateAsync(),
    isFinishingConnect: connectAccountMutation.isPending,
    startReconnect: (returnPath: string) => relinkGoogleMutation.mutate(returnPath),
    isRelinking: relinkGoogleMutation.isPending,
    // useSyncEmailAccount already toasts its own error and still rejects
    // afterwards (same contract as connectAccountMutation above) - the
    // success toast here only fires once that mutation actually resolved.
    finishReconnect: () => syncAccount().then(() => toast.success('Gmail reconnected')),
  };
}
