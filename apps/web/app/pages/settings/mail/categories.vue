<script setup lang="ts">
import EmailSettingsCategories from '~/features/email/components/EmailSettingsCategories.vue';
import EmailSettingsPageShell from '~/features/email/components/EmailSettingsPageShell.vue';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('email.settings.pageTitle') });
</script>

<template>
  <EmailSettingsPageShell :title="t('email.settings.tabs.categories')">
    <EmailSettingsCategories />
  </EmailSettingsPageShell>
</template>
