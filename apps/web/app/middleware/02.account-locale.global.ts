import { patchUserLocale } from '~/features/user/composables/useUserProfileApi';

// Runs after 01.auth.global.ts, so the session is known. Awaiting setLocale
// here makes the very first render use the account language.
export default defineNuxtRouteMiddleware(async () => {
  const session = useAuthSession();
  const syncedUserId = useState<string | null>(
    'account-locale-synced',
    () => null,
  );
  if (!session.value || session.value.user.id === syncedUserId.value) return;
  syncedUserId.value = session.value.user.id;

  const { $i18n, $api } = useNuxtApp();
  const accountLocale = $i18n.locales.value.find(
    (option) => option.code === session.value?.user.locale,
  );

  if (accountLocale) {
    if (accountLocale.code !== $i18n.locale.value) {
      await $i18n.setLocale(accountLocale.code);
    }
    return;
  }

  if (session.value.user.locale != null) return;

  // Not awaited, so navigation isn't blocked. A failure is retried on the next page load.
  patchUserLocale($api, $i18n.locale.value)
    .then(refreshAuthSession)
    .catch(() => undefined);
});
