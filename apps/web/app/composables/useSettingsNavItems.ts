import { useGetMcpSettings } from '~/features/mcp/composables/useMcpApi';
import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';
import { isOwnerOrAdmin } from '~/features/organization/lib/roles';

export interface SettingsNavItem {
  id: string;
  path: string;
  icon: string;
  label: string;
  exact: boolean;
}

export interface SettingsNavGroup {
  id: string;
  label: string;
  items: SettingsNavItem[];
}

export function useSettingsNavItems() {
  const { t } = useI18n();
  const { data: organization } = useGetOrganization();
  const { data: mcpSettings } = useGetMcpSettings();

  const canManageOrganization = computed(() =>
    isOwnerOrAdmin(organization.value?.role ?? ''),
  );
  const isMcpAvailable = computed(() => mcpSettings.value !== undefined);

  function item(
    id: string,
    path: string,
    icon: string,
    exact = false,
  ): SettingsNavItem {
    return { id, path, icon, label: t(`settings.nav.${id}`), exact };
  }

  const navGroups = computed<SettingsNavGroup[]>(() => {
    const organizationItems = [
      item('general', '/settings/organization', 'building-03', true),
      item('members', '/settings/organization/members', 'user-group'),
    ];
    if (canManageOrganization.value) {
      organizationItems.push(
        item('workspaces', '/settings/organization/workspaces', 'grid-view'),
        item('usage', '/settings/organization/usage', 'wallet-01'),
      );
    }

    const integrationItems = [
      item('connections', '/settings/connections', 'connect'),
    ];
    if (isMcpAvailable.value) {
      integrationItems.push(item('mcp', '/settings/mcp', 'plug-01'));
    }

    const emailItems = [
      item('general', '/settings/mail', 'mail-01', true),
      item('categories', '/settings/mail/categories', 'tag-01'),
      item('senders', '/settings/mail/senders', 'user-group'),
    ];

    return [
      {
        id: 'account',
        label: t('settings.groups.account'),
        items: [
          item('profile', '/settings/profile', 'user'),
          item('language', '/settings/language', 'translate'),
          item('credits', '/settings/credits', 'coins-01'),
        ],
      },
      {
        id: 'organization',
        label: t('settings.groups.organization'),
        items: organizationItems,
      },
      {
        id: 'email',
        label: t('settings.groups.email'),
        items: emailItems,
      },
      {
        id: 'integrations',
        label: t('settings.groups.integrations'),
        items: integrationItems,
      },
    ];
  });

  return { navGroups };
}
