<script setup lang="ts">
import EmailPrivateWorkspaceGate from '~/features/email/components/EmailPrivateWorkspaceGate.vue';
import EmailClient from '~/features/email/components/EmailClient.vue';

// New mail's own route:
// the draft panel alone, no thread below it. A two-segment path
// (`/mail/draft/:draftId`), so it never collides with the optional
// single-segment `mail/[[threadId]].vue` or the static `mail/settings.vue`.
definePageMeta({
  validate: (route) => hasValidEmailDraftId(route.params),
});

const route = useRoute();
const draftId = computed(() => route.params.draftId as string);

const { t } = useI18n();

useHead({
  title: t('email.pageTitle'),
});
</script>

<template>
  <EmailPrivateWorkspaceGate>
    <EmailClient :draft-id="draftId" />
  </EmailPrivateWorkspaceGate>
</template>
