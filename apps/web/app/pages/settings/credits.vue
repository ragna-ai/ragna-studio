<script setup lang="ts">
import UserCreditSettings from '~/features/credit/components/UserCreditSettings.vue';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('settings.sections.credits.title') });
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="t('settings.sections.credits.title')"
          :subtitle="t('settings.sections.credits.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>

    <div class="space-y-6 px-5 pb-10">
      <UserCreditSettings />
    </div>
  </SectionWrapper>
</template>
