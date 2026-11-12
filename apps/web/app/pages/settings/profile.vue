<script setup lang="ts">
import AccountDeletionCard from '~/features/organization/components/AccountDeletionCard.vue';
import UserProfileSettings from '~/features/user/components/UserProfileSettings.vue';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('user.profile.title') });
</script>

<template>
  <SectionWrapper>
    <Heading>
      <template #top>
        <HeadingTitle
          :title="t('user.profile.title')"
          :subtitle="t('user.profile.subtitle')"
        />
      </template>
    </Heading>

    <div class="space-y-6 px-page pt-6 pb-10">
      <UserProfileSettings />
      <AccountDeletionCard />
    </div>
  </SectionWrapper>
</template>
