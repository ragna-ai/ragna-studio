<script setup lang="ts">
// Imports
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';

// Props
// Emits
// Refs
// Composables
const { t } = useI18n();

// Computed
// Functions
// Hooks
</script>

<template>
  <Alert>
    <AlertTitle>{{ t('social.linkedinHint.title') }}</AlertTitle>
    <AlertDescription>
      <span>{{ t('social.linkedinHint.message') }}</span>
      <NuxtLinkLocale to="/account" class="ml-1 underline underline-offset-2">
        {{ t('social.linkedinHint.link') }}
      </NuxtLinkLocale>
    </AlertDescription>
  </Alert>
</template>
