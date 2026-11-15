<script setup lang="ts">
import PasskeysCard from '~/features/sign-in/components/PasskeysCard.vue';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('settings.sections.passkeys.title') });
</script>

<template>
  <SectionWrapper>
    <Heading>
      <template #top>
        <HeadingTitle
          :title="t('settings.sections.passkeys.title')"
          :subtitle="t('settings.sections.passkeys.subtitle')"
        />
      </template>
    </Heading>

    <div class="space-y-6 px-page pt-6 pb-10">
      <PasskeysCard />
    </div>
  </SectionWrapper>
</template>
