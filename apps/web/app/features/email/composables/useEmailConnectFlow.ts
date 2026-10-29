import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { useSyncEmailAccount } from '~/features/email/composables/useEmailAccountApi';
import { emailKeys } from '~/features/email/composables/useEmailKeys';
import { startAccountSyncForcePoll } from '~/features/email/lib/email-account-sync-poll';
import type {
  ConnectIntegrationResponse,
  IntegrationConnectionsResponse,
  IntegrationId,
  ProviderId,
} from '@repo/integrations/catalog';
import type {
  EmailAccount,
  EmailAccountStatusResponse,
  EmailProviderKind,
} from '~/features/email/types';
import { extractErrorMessage } from '~/lib/api-error';

// Round-trips through the query string so the mail page knows which flow to finish on return from the provider.
export const MAIL_CONNECT_CALLBACK_PARAM = 'mailConnect';
export const MAIL_RECONNECT_CALLBACK_PARAM = 'mailReconnect';

interface ProviderAuthConfig {
  connectionProvider: ProviderId;
  integrationId: IntegrationId;
  displayName: string;
}

const PROVIDER_AUTH_CONFIG: Record<EmailProviderKind, ProviderAuthConfig> = {
  gmail: {
    connectionProvider: 'google',
    integrationId: 'gmail',
    displayName: 'Gmail',
  },
  microsoft: {
    connectionProvider: 'microsoft',
    integrationId: 'outlook-mail',
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

// Provider-aware two-step connect flow: POST /integration/connect redirects to the provider and back, then POST /email/account/connect binds the mailbox to the connection.
export function useEmailConnectFlow() {
  const { $i18n } = useNuxtApp();
  const queryClient = useQueryClient();
  // linkSocial() resolves once the redirect starts, so stay busy until the page unloads.
  const isRedirecting = ref(false);

  // A back-navigation can restore this page from the bfcache with the flag still set.
  useEventListener(window, 'pageshow', (event) => {
    if (event.persisted) isRedirecting.value = false;
  });

  async function link(
    { provider, returnPath }: LinkVariables,
    callbackParam: string,
  ) {
    const { url } = await useNuxtApp().$api<ConnectIntegrationResponse>(
      '/integration/connect',
      {
        method: 'POST',
        body: {
          integrationId: PROVIDER_AUTH_CONFIG[provider].integrationId,
          returnPath: `${returnPath}?${callbackParam}=${provider}`,
        },
      },
    );
    window.location.assign(url);
  }

  const linkMutation = useMutation({
    mutationFn: (variables: LinkVariables) =>
      link(variables, MAIL_CONNECT_CALLBACK_PARAM),
    onSuccess: () => {
      isRedirecting.value = true;
    },
    onError: (_error, { provider }) =>
      toast.error(
        $i18n.t('email.toast.connectStartFailed', {
          provider: PROVIDER_AUTH_CONFIG[provider].displayName,
        }),
      ),
  });

  const relinkMutation = useMutation({
    mutationFn: (variables: LinkVariables) =>
      link(variables, MAIL_RECONNECT_CALLBACK_PARAM),
    onSuccess: () => {
      isRedirecting.value = true;
    },
    onError: (_error, { provider }) =>
      toast.error(
        $i18n.t('email.toast.reconnectStartFailed', {
          provider: PROVIDER_AUTH_CONFIG[provider].displayName,
        }),
      ),
  });

  const connectAccountMutation = useMutation<
    ConnectEmailAccountResponse,
    unknown,
    EmailProviderKind
  >({
    mutationKey: emailKeys.connect(),
    mutationFn: async (provider) => {
      const { $api } = useNuxtApp();
      const { connections } = await $api<IntegrationConnectionsResponse>(
        '/integration/connection',
        { method: 'GET' },
      );
      const connection = connections.find(
        (candidate) =>
          candidate.provider ===
          PROVIDER_AUTH_CONFIG[provider].connectionProvider,
      );
      if (!connection) {
        throw new Error('No connection found for the provider');
      }
      return $api<ConnectEmailAccountResponse>('/email/account/connect', {
        method: 'POST',
        body: { provider, connectionId: connection.id },
      });
    },
    onSuccess: ({ account }, provider) => {
      // The response predates the initial sync job, so poll until it settles (like "Sync now").
      // Opened before setQueryData, which re-evaluates the account query's refetchInterval.
      startAccountSyncForcePoll(account.lastSyncedAt);
      queryClient.setQueryData<EmailAccountStatusResponse>(
        emailKeys.account(),
        { connected: true, account },
      );
      toast.success(
        $i18n.t('email.toast.connected', {
          provider: PROVIDER_AUTH_CONFIG[provider].displayName,
        }),
      );
    },
    onError: (error, provider) => {
      // A 400 here almost always means the connection lacks the required scope;
      // the connect prompt stays visible either way.
      toast.error(
        extractErrorMessage(
          error,
          $i18n.t('email.toast.connectFailed', {
            provider: PROVIDER_AUTH_CONFIG[provider].displayName,
          }),
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
          $i18n.t('email.toast.reconnected', {
            provider: PROVIDER_AUTH_CONFIG[provider].displayName,
          }),
        ),
      ),
  };
}
