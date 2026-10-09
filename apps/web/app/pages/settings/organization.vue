<script setup lang="ts">
import OrganizationDangerZone from '~/features/organization/components/OrganizationDangerZone.vue';
import OrganizationInvitationsCard from '~/features/organization/components/OrganizationInvitationsCard.vue';
import OrganizationMembersCard from '~/features/organization/components/OrganizationMembersCard.vue';
import OrganizationNameCard from '~/features/organization/components/OrganizationNameCard.vue';
import OrganizationTransferCard from '~/features/organization/components/OrganizationTransferCard.vue';
import OrganizationUsageCard from '~/features/organization/components/OrganizationUsageCard.vue';
import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';
import {
  hasRole,
  isOwnerOrAdmin,
  OWNER_ROLE,
} from '~/features/organization/lib/roles';

// Composables
const { t } = useI18n();
useHead({ title: t('organization.title') });

const { data: organization, isPending, error } = useGetOrganization();

// Computed
const canManage = computed(() =>
  isOwnerOrAdmin(organization.value?.role ?? ''),
);
const isOwner = computed(() =>
  hasRole(organization.value?.role ?? '', OWNER_ROLE),
);
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="t('organization.title')"
          :subtitle="t('organization.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>

    <div class="space-y-6 px-5 pb-10">
      <div v-if="isPending" class="space-y-4">
        <Skeleton class="h-24 w-full" />
        <Skeleton class="h-24 w-full" />
      </div>
      <p v-else-if="error" class="text-sm text-stone-500">
        {{ t('organization.loadError') }}
      </p>
      <template v-else-if="organization">
        <OrganizationNameCard
          :key="organization.name"
          :name="organization.name"
          :can-edit="canManage"
        />
        <OrganizationMembersCard :can-manage="canManage" />
        <template v-if="canManage">
          <OrganizationInvitationsCard />
          <OrganizationUsageCard />
        </template>
        <template v-if="isOwner">
          <OrganizationTransferCard />
          <OrganizationDangerZone :organization-name="organization.name" />
        </template>
      </template>
    </div>
  </SectionWrapper>
</template>
