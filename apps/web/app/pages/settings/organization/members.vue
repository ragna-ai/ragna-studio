<script setup lang="ts">
import OrganizationInvitationsCard from '~/features/organization/components/OrganizationInvitationsCard.vue';
import OrganizationMembersCard from '~/features/organization/components/OrganizationMembersCard.vue';
import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';
import { isOwnerOrAdmin } from '~/features/organization/lib/roles';

definePageMeta({ layout: 'settings' });

const { t } = useI18n();
useHead({ title: t('settings.sections.members.title') });

const { data: organization, isPending, error } = useGetOrganization();

const canManage = computed(() =>
  isOwnerOrAdmin(organization.value?.role ?? ''),
);
</script>

<template>
  <SectionWrapper>
    <Heading>
      <template #top>
        <HeadingTitle
          :title="t('settings.sections.members.title')"
          :subtitle="t('settings.sections.members.subtitle')"
        />
      </template>
    </Heading>

    <div class="space-y-6 px-page pt-6 pb-10">
      <div v-if="isPending" class="space-y-4">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>
      <p v-else-if="error" class="text-sm text-stone-500">
        {{ t('organization.loadError') }}
      </p>
      <template v-else-if="organization">
        <OrganizationMembersCard :can-manage="canManage" />
        <OrganizationInvitationsCard v-if="canManage" />
      </template>
    </div>
  </SectionWrapper>
</template>
