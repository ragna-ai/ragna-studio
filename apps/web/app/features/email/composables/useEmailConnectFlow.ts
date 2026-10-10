import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { useSyncEmailAccount } from '~/features/email/composables/useEmailAccountApi';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import type {
  EmailAccount,
  EmailAccountStatusResponse,
  EmailProviderKind,
} from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';

export const GMAIL_MODIFY_SCOPE =
  'https://www.googleapis.com/auth/gmail.modify';
export const MICROSOFT_MAIL_SCOPES = [
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
];

// Round-trips through the query string so the mail page knows which flow to finish on return from the provider.
export const MAIL_CONNECT_CALLBACK_PARAM = 'mailConnect';
export const MAIL_RECONNECT_CALLBACK_PARAM = 'mailReconnect';

interface ProviderAuthConfig {
  authProviderId: 'google' | 'microsoft';
  scopes: string[];
  displayName: string;
}

const PROVIDER_AUTH_CONFIG: Record<EmailProviderKind, ProviderAuthConfig> = {
  gmail: {
    authProviderId: 'google',
    scopes: [GMAIL_MODIFY_SCOPE],
    displayName: 'Gmail',
  },
  microsoft: {
    authProviderId: 'microsoft',
    scopes: MICROSOFT_MAIL_SCOPES,
    displayName: 'Outlook',
  },
};

interface LinkVariables {
  provider: EmailProviderKind;
  returnPath: string;
}

interface ConnectEmailAccountResponse {
  account: EmailAccount;
}

// Provider-aware two-step connect flow: linkSocial() redirects to the provider and back, then POST /email/account/connect creates the row.
export function useEmailConnectFlow() {
  const authClient = useAuth();
  const queryClient = useQueryClient();
  // linkSocial() resolves once the redirect starts, so stay busy until the page unloads.
  const isRedirecting = ref(false);

  // A back-navigation can restore this page from the bfcache with the flag still set.
  useEventListener(window, 'pageshow', (event) => {
    if (event.persisted) isRedirecting.value = false;
  });

  function link(
    { provider, returnPath }: LinkVariables,
    callbackParam: string,
  ) {
    const config = PROVIDER_AUTH_CONFIG[provider];
    const appOrigin = window.location.origin;
    return authClient.linkSocial({
      provider: config.authProviderId,
      scopes: config.scopes,
      callbackURL: `${appOrigin}${returnPath}?${callbackParam}=${provider}`,
    });
  }

  const linkMutation = useMutation({
    mutationFn: (variables: LinkVariables) =>
      link(variables, MAIL_CONNECT_CALLBACK_PARAM),
    onSuccess: ({ error }, { provider }) => {
      if (!error) {
        isRedirecting.value = true;
        return;
      }
      toast.error(
        `Failed to start connecting ${PROVIDER_AUTH_CONFIG[provider].displayName}`,
      );
    },
    onError: (_error, { provider }) =>
      toast.error(
        `Failed to start connecting ${PROVIDER_AUTH_CONFIG[provider].displayName}`,
      ),
  });

  const relinkMutation = useMutation({
    mutationFn: (variables: LinkVariables) =>
      link(variables, MAIL_RECONNECT_CALLBACK_PARAM),
    onSuccess: ({ error }, { provider }) => {
      if (!error) {
        isRedirecting.value = true;
        return;
      }
      toast.error(
        `Failed to start reconnecting ${PROVIDER_AUTH_CONFIG[provider].displayName}`,
      );
    },
    onError: (_error, { provider }) =>
      toast.error(
        `Failed to start reconnecting ${PROVIDER_AUTH_CONFIG[provider].displayName}`,
      ),
  });

  const connectAccountMutation = useMutation<
    ConnectEmailAccountResponse,
    unknown,
    EmailProviderKind
  >({
    mutationKey: emailKeys.connect(),
    mutationFn: (provider) =>
      useNuxtApp().$api<ConnectEmailAccountResponse>('/email/account/connect', {
        method: 'POST',
        body: { provider },
      }),
    onSuccess: ({ account }, provider) => {
      // Seed the cache from the response so the inbox renders together with the toast.
      queryClient.setQueryData<EmailAccountStatusResponse>(
        emailKeys.account(),
        { connected: true, account },
      );
      toast.success(`${PROVIDER_AUTH_CONFIG[provider].displayName} connected`);
    },
    onError: (error, provider) => {
      // A 400 here almost always means the link is missing or lacks the required scope
      // (email-provider.service.ts's scope check); the connect prompt stays visible either way.
      toast.error(
        extractErrorMessage(
          error,
          `Failed to connect ${PROVIDER_AUTH_CONFIG[provider].displayName}. Try reconnecting`,
        ),
      );
    },
  });

  // Reuses the "Sync now" mutation (useEmailAccountApi.ts) so the reconnect finish also seeds the
  // account cache and opens the sync-poll window, instead of a second hand-rolled POST.
  const { mutateAsync: syncAccount } = useSyncEmailAccount();

  // Keyed instead of local isPending: the finish runs in EmailClient, but the connect prompt shows its progress.
  const finishingConnectCount = useIsMutating({
    mutationKey: emailKeys.connect(),
  });

  return {
    startConnect: (provider: EmailProviderKind, returnPath: string) =>
      linkMutation.mutate({ provider, returnPath }),
    isLinking: computed(
      () => linkMutation.isPending.value || isRedirecting.value,
    ),
    finishConnect: (provider: EmailProviderKind) =>
      connectAccountMutation.mutateAsync(provider),
    isFinishingConnect: computed(() => finishingConnectCount.value > 0),
    startReconnect: (provider: EmailProviderKind, returnPath: string) =>
      relinkMutation.mutate({ provider, returnPath }),
    isRelinking: computed(
      () => relinkMutation.isPending.value || isRedirecting.value,
    ),
    finishReconnect: (provider: EmailProviderKind) =>
      syncAccount().then(() =>
        toast.success(
          `${PROVIDER_AUTH_CONFIG[provider].displayName} reconnected`,
        ),
      ),
  };
}
