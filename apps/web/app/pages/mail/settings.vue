<script setup lang="ts">
import { MailIcon, TagIcon, UsersIcon } from '@lucide/vue';
import EmailPrivateWorkspaceGate from '~/features/email/components/EmailPrivateWorkspaceGate.vue';
import EmailSettingsAutoDraftSenders from '~/features/email/components/EmailSettingsAutoDraftSenders.vue';
import EmailSettingsCategories from '~/features/email/components/EmailSettingsCategories.vue';
import EmailSettingsGeneral from '~/features/email/components/EmailSettingsGeneral.vue';
import { useGetEmailAccount } from '~/features/email/composables/useEmailAccountApi';

const { t } = useI18n();
const { data } = useGetEmailAccount();

const account = computed(() => data.value?.account ?? null);
const currentTab = ref('general');

const sideBarTabs = computed(() => [
  { id: 'general', icon: MailIcon, label: t('email.settings.tabs.general') },
  {
    id: 'categories',
    icon: TagIcon,
    label: t('email.settings.tabs.categories'),
  },
  { id: 'senders', icon: UsersIcon, label: t('email.settings.tabs.senders') },
]);

useHead({
  title: t('email.settings.pageTitle'),
});
</script>

<template>
  <EmailPrivateWorkspaceGate>
    <SectionWrapper>
      <Heading bg-position="bottom">
        <template #top>
          <HeadingTitle
            :title="t('email.settings.pageTitle')"
            :subtitle="t('email.settings.subtitle')"
          />
        </template>
        <template #bottom> </template>
      </Heading>
      <div v-if="account" class="px-26 pt-10">
        <TabSidebar v-model="currentTab" :tabs="sideBarTabs">
          <template #general>
            <EmailSettingsGeneral :account="account" />
          </template>
          <template #categories>
            <EmailSettingsCategories />
          </template>
          <template #senders>
            <EmailSettingsAutoDraftSenders />
          </template>
        </TabSidebar>
      </div>
      <p v-else class="px-5 text-sm text-muted-foreground">
        {{ t('email.settings.notConnected') }}
      </p>
    </SectionWrapper>
  </EmailPrivateWorkspaceGate>
</template>
