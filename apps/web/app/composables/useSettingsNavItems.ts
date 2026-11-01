import {
  BuildingIcon,
  CableIcon,
  CoinsIcon,
  LanguagesIcon,
  PlugIcon,
  UserIcon,
  UsersIcon,
  WalletCardsIcon,
  LayoutGridIcon,
  MailIcon,
  TagIcon,
} from '@lucide/vue';
import type { Component } from 'vue';
import { useGetMcpSettings } from '~/features/mcp/composables/useMcpApi';
import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';
import { isOwnerOrAdmin } from '~/features/organization/lib/roles';

export interface SettingsNavItem {
  id: string;
  path: string;
  icon: Component;
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
    icon: Component,
    exact = false,
  ): SettingsNavItem {
    return { id, path, icon, label: t(`settings.nav.${id}`), exact };
  }

  const navGroups = computed<SettingsNavGroup[]>(() => {
    const organizationItems = [
      item('general', '/settings/organization', BuildingIcon, true),
      item('members', '/settings/organization/members', UsersIcon),
    ];
    if (canManageOrganization.value) {
      organizationItems.push(
        item('workspaces', '/settings/organization/workspaces', LayoutGridIcon),
        item('usage', '/settings/organization/usage', WalletCardsIcon),
      );
    }

    const integrationItems = [
      item('connections', '/settings/connections', CableIcon),
    ];
    if (isMcpAvailable.value) {
      integrationItems.push(item('mcp', '/settings/mcp', PlugIcon));
    }

    const emailItems = [
      item('general', '/settings/mail', MailIcon, true),
      item('categories', '/settings/mail/categories', TagIcon),
      item('senders', '/settings/mail/senders', UsersIcon),
    ];

    return [
      {
        id: 'account',
        label: t('settings.groups.account'),
        items: [
          item('profile', '/settings/profile', UserIcon),
          item('language', '/settings/language', LanguagesIcon),
          item('credits', '/settings/credits', CoinsIcon),
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
