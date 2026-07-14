<script setup lang="ts">
import UserProfileSettings from '~/features/user/components/UserProfileSettings.vue';
import UserSocialSettings from '~/features/user/components/UserSocialSettings.vue';

// Imports

// Props
// Emits

// Refs

// Composables

// Computed
// Functions

// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="$t('user.profile.title')"
          :subtitle="$t('user.profile.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>
    <UserProfileSettings />
    <UserSocialSettings />
  </SectionWrapper>
</template>
