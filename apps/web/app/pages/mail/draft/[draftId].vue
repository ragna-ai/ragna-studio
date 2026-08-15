<script setup lang="ts">
import EmailClient from '~/features/email/components/EmailClient.vue';

// New mail's own route (docs/email/drafts-change-request.md, section 2):
// the draft panel alone, no thread below it. A two-segment path
// (`/mail/draft/:draftId`), so it never collides with the single-segment
// `mail/[threadId].vue` or the static `mail/drafts.vue`.
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
  <EmailClient :draft-id="draftId" />
</template>
