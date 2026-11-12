<script setup lang="ts">
import OrganizationUsageCard from '~/features/organization/components/OrganizationUsageCard.vue';
import { useRequireOrganizationManager } from '~/features/organization/composables/useRequireOrganizationManager';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('settings.sections.usage.title') });

const { canManage } = useRequireOrganizationManager();
</script>

<template>
  <SectionWrapper>
    <Heading>
      <template #top>
        <HeadingTitle
          :title="t('settings.sections.usage.title')"
          :subtitle="t('settings.sections.usage.subtitle')"
        />
      </template>
    </Heading>

    <div class="space-y-6 px-page pt-6 pb-10">
      <OrganizationUsageCard v-if="canManage" />
    </div>
  </SectionWrapper>
</template>
