import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';

export type SocialProviderId = 'google' | 'microsoft' | 'linkedin';

export interface LinkedAccount {
  /** Local `account` row id. This is what `unlinkAccount()` expects, not `accountId`. */
  id: string;
  accountId: string;
  providerId: string;
}

interface DisconnectAccountInput {
  accountId: string;
}

const SOCIAL_ACCOUNTS_QUERY_KEY = ['user', 'social-accounts'];

/**
 * Loads the current user's linked social accounts (better-auth `account`
 * table) and exposes connect/disconnect actions backed by the better-auth
 * client. No custom API endpoints: connect/disconnect and token storage are
 * handled entirely by better-auth's account linking.
 */
export default function useUserSocialAccounts() {
  const authClient = useAuth();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const accountsQuery = useQuery({
    queryKey: SOCIAL_ACCOUNTS_QUERY_KEY,
    queryFn: async (): Promise<LinkedAccount[]> => {
      const { data, error } = await authClient.listAccounts();
      if (error) throw error;
      return data ?? [];
    },
  });

  function invalidateAccounts() {
    return queryClient.invalidateQueries({ queryKey: SOCIAL_ACCOUNTS_QUERY_KEY });
  }

  const connectMutation = useMutation({
    mutationFn: (provider: SocialProviderId) => {
      // Relative URLs resolve against the auth server (API origin), so the
      // callback must be absolute to land back on the web app.
      const appOrigin = window.location.origin;
      return authClient.linkSocial({ provider, callbackURL: `${appOrigin}/account` });
    },
    onSuccess: ({ error }) => {
      // On success the client redirects the browser to the provider, so
      // there is nothing left to update locally here.
      if (error) toast.error(t('user.social.connectError'));
    },
    onError: () => toast.error(t('user.social.connectError')),
  });

  const disconnectMutation = useMutation({
    mutationFn: (account: DisconnectAccountInput) => authClient.unlinkAccount(account),
    onSuccess: async ({ error }) => {
      if (error) {
        toast.error(t('user.social.disconnectError'));
        return;
      }
      await invalidateAccounts();
      toast.success(t('user.social.disconnectSuccess'));
    },
    onError: () => toast.error(t('user.social.disconnectError')),
  });

  return {
    accounts: computed(() => accountsQuery.data.value ?? []),
    isLoading: accountsQuery.isLoading,
    isError: accountsQuery.isError,
    connect: connectMutation.mutate,
    connectingProvider: computed(() =>
      connectMutation.isPending.value ? connectMutation.variables.value : null,
    ),
    disconnect: disconnectMutation.mutate,
    disconnectingAccountId: computed(() =>
      disconnectMutation.isPending.value ? disconnectMutation.variables.value?.accountId : null,
    ),
  };
}
