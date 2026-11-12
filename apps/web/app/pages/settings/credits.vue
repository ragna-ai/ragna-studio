<script setup lang="ts">
import UserCreditSettings from '~/features/credit/components/UserCreditSettings.vue';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('settings.sections.credits.title') });
</script>

<template>
  <SectionWrapper>
    <Heading>
      <template #top>
        <HeadingTitle
          :title="t('settings.sections.credits.title')"
          :subtitle="t('settings.sections.credits.subtitle')"
        />
      </template>
    </Heading>

    <div class="space-y-6 px-page pt-6 pb-10">
      <UserCreditSettings />
    </div>
  </SectionWrapper>
</template>
