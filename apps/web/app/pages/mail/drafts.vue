<script setup lang="ts">
import EmailPendingDraftsList from '~/features/email/components/EmailPendingDraftsList.vue';

const { t } = useI18n();

useHead({
  title: t('email.pendingDrafts.pageTitle'),
});
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle :title="t('email.pendingDrafts.title')" :subtitle="t('email.pendingDrafts.subtitle')" />
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-5">
      <EmailPendingDraftsList />
    </div>
  </SectionWrapper>
</template>
