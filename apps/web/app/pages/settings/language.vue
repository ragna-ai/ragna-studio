<script setup lang="ts">
import UserLanguageSettings from '~/features/user/components/UserLanguageSettings.vue';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('settings.sections.language.title') });
</script>

<template>
  <SectionWrapper>
    <Heading>
      <template #top>
        <HeadingTitle
          :title="t('settings.sections.language.title')"
          :subtitle="t('settings.sections.language.subtitle')"
        />
      </template>
    </Heading>

    <div class="space-y-6 px-page pt-6 pb-10">
      <UserLanguageSettings />
    </div>
  </SectionWrapper>
</template>
