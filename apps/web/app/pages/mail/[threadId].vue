<script setup lang="ts">
import EmailClient from '~/features/email/components/EmailClient.vue';

definePageMeta({
  validate: (route) => hasValidEmailThreadId(route.params),
});

const route = useRoute();
const threadId = computed(() => route.params.threadId as string);

const { t } = useI18n();

useHead({
  title: t('email.pageTitle'),
});
</script>

<template>
  <EmailClient :thread-id="threadId" />
</template>
