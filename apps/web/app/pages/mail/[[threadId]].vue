<script setup lang="ts">
import EmailPrivateWorkspaceGate from '~/features/email/components/EmailPrivateWorkspaceGate.vue';
import EmailClient from '~/features/email/components/EmailClient.vue';

// Optional dynamic segment (Nuxt's [[param]] syntax) so /mail and
// /mail/:threadId are the same route record: switching between them updates
// this one EmailClient instance's threadId prop instead of unmounting and
// remounting the whole page tree, which used to reset EmailThreadList's
// scroll position on every thread open (it lived across two separate page
// files, `index.vue` and `[threadId].vue`).
//
// `key: false` is still required on top of that merge: Nuxt's NuxtPage keys
// pages by their *interpolated* path by default (generateRouteKey in
// nuxt/dist/pages/runtime/utils.js), so `/mail/:threadId?` alone would still
// get a fresh key - and a full remount - for every distinct threadId, even
// within this one route record.
definePageMeta({
  key: false,
  validate: (route) => hasValidOptionalEmailThreadId(route.params),
});

const route = useRoute();
const threadId = computed(() => route.params.threadId as string | undefined);

const { t } = useI18n();

useHead({
  title: t('email.pageTitle'),
});
</script>

<template>
  <EmailPrivateWorkspaceGate>
    <EmailClient :thread-id="threadId" />
  </EmailPrivateWorkspaceGate>
</template>
