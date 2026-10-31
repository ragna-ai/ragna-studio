<script setup lang="ts">
import EmailSettingsAutoDraftSenders from '~/features/email/components/EmailSettingsAutoDraftSenders.vue';
import EmailSettingsPageShell from '~/features/email/components/EmailSettingsPageShell.vue';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('email.settings.pageTitle') });
</script>

<template>
  <EmailSettingsPageShell :title="t('email.settings.tabs.senders')">
    <EmailSettingsAutoDraftSenders />
  </EmailSettingsPageShell>
</template>
