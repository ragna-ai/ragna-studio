<script setup lang="ts">
import { toast } from 'vue-sonner';
import {
  organizationErrorMessage,
  useGetOrganization,
  useLeaveOrganization,
} from '~/features/organization/composables/useOrganizationApi';
import { hasRole, OWNER_ROLE } from '~/features/organization/lib/roles';

// Composables
const { t } = useI18n();
const { confirm } = useConfirmDialog();
const { data: organization } = useGetOrganization();
const { mutateAsync: leaveOrganization, isPending } = useLeaveOrganization();

// Computed
const isOwner = computed(() =>
  hasRole(organization.value?.role ?? '', OWNER_ROLE),
);

// Functions
async function handleDelete() {
  const confirmed = await confirm({
    title: t('organization.account.confirm.title'),
    message: t('organization.account.confirm.message'),
    confirmLabel: t('organization.account.confirm.confirm'),
    cancelLabel: t('common.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) return;
  try {
    await leaveOrganization();
  } catch (error) {
    toast.error(
      organizationErrorMessage(error, t('organization.account.error')),
    );
    return;
  }
  await useAuth().signOut();
  await navigateTo('/auth/login');
}
</script>

<template>
  <Card class="mx-auto w-full max-w-2xl border-destructive/50">
    <CardHeader>
      <CardTitle class="text-destructive">{{
        t('organization.account.title')
      }}</CardTitle>
    </CardHeader>
    <CardContent v-if="organization" class="space-y-3">
      <template v-if="isOwner">
        <p class="text-sm text-muted-foreground">
          {{ t('organization.account.ownerHint') }}
        </p>
        <Button variant="outline" as-child>
          <NuxtLink to="/settings/organization">{{
            t('organization.account.goToSettings')
          }}</NuxtLink>
        </Button>
      </template>
      <template v-else>
        <p class="text-sm text-muted-foreground">
          {{ t('organization.account.description') }}
        </p>
        <Button
          variant="destructive"
          :disabled="isPending"
          @click="handleDelete"
        >
          {{ t('organization.account.action') }}
        </Button>
      </template>
    </CardContent>
  </Card>
</template>
