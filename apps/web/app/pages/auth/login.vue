<script setup lang="ts">
import { Button } from '@/components/ui/button';
import { authClient } from '@repo/auth/client';
import { toast } from 'vue-sonner';

definePageMeta({ layout: 'auth' });
useHead({ title: 'Login' });

const signingIn = ref<'google' | 'microsoft' | 'apple' | null>(null);

async function signIn(provider: 'google' | 'microsoft' | 'apple') {
  signingIn.value = provider;
  try {
    await authClient.signIn.social({ provider });
  } catch {
    toast.error('Sign in failed. Please try again.');
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

      <h1 class="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p class="mt-2 text-sm text-muted-foreground">
        Sign in to your account to continue
      </p>

      <div class="mt-8 space-y-4">
        <Button
          variant="outline"
          class="w-full"
          :disabled="signingIn !== null"
          @click="signIn('google')"
        >
          <Icon
            v-if="signingIn !== 'google'"
            name="logos:google-icon"
            class="h-4 w-4"
          />
          <Icon
            v-else
            name="lucide:loader-circle"
            class="h-4 w-4 animate-spin"
          />
          Continue with Google
        </Button>

        <Button
          variant="outline"
          class="w-full"
          :disabled="signingIn !== null"
          @click="signIn('microsoft')"
        >
          <Icon
            v-if="signingIn !== 'microsoft'"
            name="logos:microsoft-icon"
            class="h-4 w-4"
          />
          <Icon
            v-else
            name="lucide:loader-circle"
            class="h-4 w-4 animate-spin"
          />
          Continue with Microsoft
        </Button>

        <Button
          variant="outline"
          class="w-full"
          :disabled="signingIn !== null"
          @click="signIn('apple')"
        >
          <Icon
            v-if="signingIn !== 'apple'"
            name="logos:apple"
            class="h-4 w-4"
          />
          <Icon
            v-else
            name="lucide:loader-circle"
            class="h-4 w-4 animate-spin"
          />
          Continue with Apple
        </Button>
      </div>

      <p class="mt-8 text-center text-xs text-muted-foreground">
        By continuing, you agree to our
        <NuxtLink
          to="/terms"
          class="underline underline-offset-4 hover:text-foreground"
        >
          Terms of Service
        </NuxtLink>
        and
        <NuxtLink
          to="/privacy"
          class="underline underline-offset-4 hover:text-foreground"
          >Privacy Policy</NuxtLink
        >.
      </p>
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
        "The platform that helped us ship faster and scale with confidence."
      </p>
      <footer class="text-sm text-stone-400">
        Sofia Davis &mdash; CTO, Acme Inc.
      </footer>
    </blockquote>
  </div>
</template>
