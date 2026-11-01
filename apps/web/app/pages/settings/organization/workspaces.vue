<script setup lang="ts">
import OrganizationWorkspacesCard from '~/features/organization/components/OrganizationWorkspacesCard.vue';
import { useRequireOrganizationManager } from '~/features/organization/composables/useRequireOrganizationManager';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('settings.sections.workspaces.title') });

const { canManage } = useRequireOrganizationManager();
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="t('settings.sections.workspaces.title')"
          :subtitle="t('settings.sections.workspaces.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>

    <div class="space-y-6 px-5 pb-10">
      <OrganizationWorkspacesCard v-if="canManage" />
    </div>
  </SectionWrapper>
</template>
