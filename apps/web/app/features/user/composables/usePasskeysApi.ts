import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import type { PasskeyRecord } from '@repo/auth/client';

import { unwrapAuthResult } from '~/lib/auth-result';

export const passkeyKeys = {
  all: ['passkeys'] as const,
};

interface RenamePasskeyInput {
  id: string;
  name: string;
}

export function passkeyErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useGetPasskeys() {
  const authClient = useAuth();
  const { t } = useI18n();
  return useQuery<PasskeyRecord[]>({
    queryKey: passkeyKeys.all,
    queryFn: async () =>
      unwrapAuthResult(
        await authClient.passkey.listUserPasskeys(),
        t('user.passkeys.requestFailed'),
      ),
  });
}

export function useAddPasskey() {
  const authClient = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  return useMutation<PasskeyRecord, Error, string>({
    mutationFn: async (name) =>
      unwrapAuthResult(
        await authClient.passkey.addPasskey({ name }),
        t('user.passkeys.requestFailed'),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: passkeyKeys.all }),
  });
}

export function useRenamePasskey() {
  const authClient = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, RenamePasskeyInput>({
    mutationFn: async (input) =>
      unwrapAuthResult(
        await authClient.passkey.updatePasskey(input),
        t('user.passkeys.requestFailed'),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: passkeyKeys.all }),
  });
}

export function useDeletePasskey() {
  const authClient = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: async (id) =>
      unwrapAuthResult(
        await authClient.passkey.deletePasskey({ id }),
        t('user.passkeys.requestFailed'),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: passkeyKeys.all }),
  });
}
