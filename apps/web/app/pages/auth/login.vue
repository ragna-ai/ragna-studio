<script setup lang="ts">
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TriangleAlertIcon } from '@lucide/vue';

type SocialProvider = 'google' | 'microsoft' | 'apple';

interface SocialProviderOption {
  provider: SocialProvider;
  icon: string;
}

const SOCIAL_PROVIDERS: SocialProviderOption[] = [
  { provider: 'google', icon: 'logos:google-icon' },
  { provider: 'microsoft', icon: 'logos:microsoft-icon' },
  { provider: 'apple', icon: 'logos:apple' },
];

definePageMeta({ layout: 'auth' });

const { t } = useI18n();
useHead({ title: t('auth.login.pageTitle') });

const authClient = useAuth();
const route = useRoute();
const errorMessage = ref<string | null>(null);
const signingIn = ref<SocialProvider | null>(null);

// The OAuth callback (e.g. a rejected email allowlist check) redirects back
// here with these query params instead of resolving signIn.social() directly.
if (typeof route.query.error === 'string') {
  errorMessage.value =
    typeof route.query.error_description === 'string'
      ? route.query.error_description
      : t('auth.login.genericError');
}

async function signIn(provider: SocialProvider) {
  errorMessage.value = null;
  signingIn.value = provider;
  // Absolute URLs back to this web app. A relative path would resolve against
  // the API origin (baseURL) and land the user on the API, not the app.
  const appOrigin = window.location.origin;
  try {
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: `${appOrigin}/`,
      errorCallbackURL: `${appOrigin}/auth/login`,
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

      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <Alert
          v-if="errorMessage"
          variant="destructive"
          class="mt-6 flex items-center space-x-2"
        >
          <TriangleAlertIcon class="size-4" />
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
          :disabled="signingIn !== null"
          :last-used="authClient.isLastUsedLoginMethod(option.provider)"
          @click="signIn(option.provider)"
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
