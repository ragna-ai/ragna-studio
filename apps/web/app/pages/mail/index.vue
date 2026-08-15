<script setup lang="ts">
import EmailClient from '~/features/email/components/EmailClient.vue';

const { t } = useI18n();

useHead({
  title: t('email.pageTitle'),
});
</script>

<template>
  <EmailClient />
</template>
