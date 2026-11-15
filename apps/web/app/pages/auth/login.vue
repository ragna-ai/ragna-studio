<script setup lang="ts">
import { Alert, AlertDescription } from '@/components/ui/alert';

type SocialProvider = 'google' | 'microsoft' | 'apple';

interface SocialProviderOption {
  provider: SocialProvider;
  icon: string;
}

const SOCIAL_PROVIDERS: SocialProviderOption[] = [
  { provider: 'google', icon: 'logos:google-icon' },
  { provider: 'microsoft', icon: 'logos:microsoft-icon' },
];

definePageMeta({ layout: 'auth' });

const { t, locale } = useI18n();
useHead({ title: t('auth.login.pageTitle') });

const authClient = useAuth();
const route = useRoute();
const { resolveSignInTarget, resolveSignInErrorTarget } = useSignInRedirect();
const errorMessage = ref<string | null>(null);
const signingIn = ref<SocialProvider | null>(null);
const passkeyBusy = ref(false);

// The OAuth callback (e.g. a rejected email allowlist check) redirects back
// here with these query params instead of resolving signIn.social() directly.
if (typeof route.query.error === 'string') {
  errorMessage.value = callbackErrorMessage(route.query.error);
}

const hasInvitation = typeof route.query.invitation === 'string';

// The server's error descriptions are English only, so known codes get translated text.
const translatedCallbackErrors: Record<string, string> = {
  BANNED_USER: 'auth.login.bannedError',
  email_not_allowed: 'auth.login.emailNotAllowedError',
};

function callbackErrorMessage(error: string): string {
  const translationKey = translatedCallbackErrors[error];
  if (translationKey) return t(translationKey);
  if (typeof route.query.error_description === 'string')
    return route.query.error_description;
  return t('auth.login.genericError');
}

function onPasskeyBusy(busy: boolean) {
  passkeyBusy.value = busy;
  if (busy) errorMessage.value = null;
}

function onPasskeyError(code: string | null) {
  const translationKey = code ? translatedCallbackErrors[code] : undefined;
  errorMessage.value = t(translationKey ?? 'auth.login.passkeyError');
}

async function signIn(provider: SocialProvider) {
  errorMessage.value = null;
  signingIn.value = provider;
  try {
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: resolveSignInTarget(),
      errorCallbackURL: resolveSignInErrorTarget(),
      additionalData: { locale: locale.value },
    });
    if (error) {
      errorMessage.value = error.message ?? t('auth.login.genericError');
      signingIn.value = null;
    }
  } catch {
    errorMessage.value = t('auth.login.genericError');
    signingIn.value = null;
  }
}
</script>

<template>
  <div class="flex flex-col justify-center px-8 py-12 sm:px-16">
    <div class="mx-auto w-full max-w-sm">
      <div class="mb-10">
        <span class="text-2xl font-semibold tracking-tight">RAGNA Studio</span>
      </div>

      <h1 class="text-2xl font-semibold tracking-tight">
        {{ $t('auth.login.title') }}
      </h1>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ $t('auth.login.subtitle') }}
      </p>

      <p v-if="hasInvitation" class="mt-4 text-sm font-medium">
        {{ $t('auth.login.invitationHint') }}
      </p>

      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <Alert v-if="errorMessage" variant="destructive" class="mt-6">
          <Icon data-slot="alert-icon" name="hugeicons:alert-circle" />
          <AlertDescription>{{ errorMessage }}</AlertDescription>
        </Alert>
      </Transition>

      <div class="mt-8 space-y-4">
        <AuthSocialSignInButton
          v-for="option in SOCIAL_PROVIDERS"
          :key="option.provider"
          :icon="option.icon"
          :label="$t(`auth.login.providers.${option.provider}`)"
          :loading="signingIn === option.provider"
          :disabled="signingIn !== null || passkeyBusy"
          :last-used="authClient.isLastUsedLoginMethod(option.provider)"
          @click="signIn(option.provider)"
        />
        <AuthPasskeySignInButton
          :disabled="signingIn !== null"
          :last-used="authClient.isLastUsedLoginMethod('passkey')"
          @busy="onPasskeyBusy"
          @error="onPasskeyError"
        />
      </div>

      <i18n-t
        keypath="auth.login.termsAgreement"
        tag="p"
        class="mt-8 text-center text-xs text-muted-foreground"
      >
        <template #terms>
          <NuxtLink
            to="/terms"
            class="underline underline-offset-4 hover:text-foreground"
          >
            {{ $t('auth.login.termsLink') }}
          </NuxtLink>
        </template>
        <template #privacy>
          <NuxtLink
            to="/privacy"
            class="underline underline-offset-4 hover:text-foreground"
          >
            {{ $t('auth.login.privacyLink') }}
          </NuxtLink>
        </template>
      </i18n-t>
    </div>
  </div>

  <div
    class="hidden bg-stone-900 lg:flex lg:flex-col lg:justify-between lg:p-12"
  >
    <div>
      <span class="text-lg font-semibold text-white">RAGNA Studio</span>
    </div>
    <blockquote class="space-y-2">
      <p class="text-lg leading-relaxed text-stone-100">
        "{{ $t('auth.login.testimonial') }}"
      </p>
      <footer class="text-sm text-stone-400">
        {{ $t('auth.login.testimonialAuthor') }}
      </footer>
    </blockquote>
  </div>
</template>
