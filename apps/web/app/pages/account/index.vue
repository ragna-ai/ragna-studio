<script setup lang="ts">
import { CoinsIcon, LanguagesIcon, Link2Icon, UserIcon } from '@lucide/vue';
import UserCreditSettings from '~/features/credit/components/UserCreditSettings.vue';
import UserLanguageSettings from '~/features/user/components/UserLanguageSettings.vue';
import UserProfileSettings from '~/features/user/components/UserProfileSettings.vue';
import UserSocialSettings from '~/features/user/components/UserSocialSettings.vue';

// Props
// Emits

// Refs
const currentTab = ref('profile');

// Composables
const { t } = useI18n();

useHead({
  title: t('user.profile.title'),
});

// Computed
const sideBarTabs = computed(() => [
  { id: 'profile', icon: UserIcon, label: t('user.tabs.profile') },
  { id: 'social', icon: Link2Icon, label: t('user.tabs.social') },
  { id: 'language', icon: LanguagesIcon, label: t('user.tabs.language') },
  { id: 'credits', icon: CoinsIcon, label: t('user.tabs.credits') },
]);
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
    <div class="px-26 pt-10">
      <TabSidebar v-model="currentTab" :tabs="sideBarTabs">
        <template #profile>
          <UserProfileSettings />
        </template>
        <template #social>
          <UserSocialSettings />
        </template>
        <template #language>
          <UserLanguageSettings />
        </template>
        <template #credits>
          <UserCreditSettings />
        </template>
      </TabSidebar>
    </div>
  </SectionWrapper>
</template>
