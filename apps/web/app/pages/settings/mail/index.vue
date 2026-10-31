<script setup lang="ts">
import EmailSettingsGeneral from '~/features/email/components/EmailSettingsGeneral.vue';
import EmailSettingsPageShell from '~/features/email/components/EmailSettingsPageShell.vue';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('email.settings.pageTitle') });
</script>

<template>
  <EmailSettingsPageShell :title="t('email.settings.pageTitle')">
    <template #default="{ account }">
      <EmailSettingsGeneral :account="account" />
    </template>
  </EmailSettingsPageShell>
</template>
