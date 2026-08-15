<script setup lang="ts">
import EmailDraftsList from '~/features/email/components/EmailDraftsList.vue';

const { t } = useI18n();

useHead({
  title: t('email.draftsFolder.pageTitle'),
});
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle :title="t('email.draftsFolder.title')" :subtitle="t('email.draftsFolder.subtitle')" />
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-5">
      <EmailDraftsList />
    </div>
  </SectionWrapper>
</template>
