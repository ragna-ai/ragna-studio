import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';
import { isOwnerOrAdmin } from '~/features/organization/lib/roles';

const GENERAL_SETTINGS_PATH = '/settings/organization';

/** Sends organization members without owner or admin role to the general settings page. */
export function useRequireOrganizationManager() {
  const { data: organization, isPending, error } = useGetOrganization();

  const canManage = computed(() =>
    isOwnerOrAdmin(organization.value?.role ?? ''),
  );

  watchEffect(() => {
    if (!organization.value || canManage.value) return;
    navigateTo(GENERAL_SETTINGS_PATH, { replace: true });
  });

  return { organization, canManage, isPending, error };
}
