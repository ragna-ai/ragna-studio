import { computed } from 'vue';
import { usePersonalWorkspace } from '~/features/workspace/composables/usePersonalWorkspace';

interface NavItem {
  id: string;
  path: string;
  icon: string;
  labelKey: string;
}

interface NavGroupConfig {
  id: string;
  labelKey?: string;
  items: NavItem[];
}

export interface TranslatedNavItem {
  id: string;
  path: string;
  icon: string;
  label: string;
}

export interface NavGroup {
  id: string;
  label?: string;
  items: TranslatedNavItem[];
}

const mailItem: NavItem = {
  id: 'mail',
  path: '/mail',
  icon: 'mail-01',
  labelKey: 'nav.mail',
};

const homeItem: NavItem = {
  id: 'home',
  path: '/',
  icon: 'home-01',
  labelKey: 'nav.home',
};

const labelledGroups: NavGroupConfig[] = [
  {
    id: 'work',
    labelKey: 'nav.groups.work',
    items: [
      {
        id: 'tasks',
        path: '/tasks',
        icon: 'check-list',
        labelKey: 'nav.tasks',
      },
      {
        id: 'document',
        path: '/document',
        icon: 'file-02',
        labelKey: 'nav.docs',
      },
      {
        id: 'dataset',
        path: '/dataset',
        icon: 'grid-table',
        labelKey: 'nav.datasets',
      },
    ],
  },
  {
    id: 'ai',
    labelKey: 'nav.groups.ai',
    items: [
      {
        id: 'chat',
        path: '/chat',
        icon: 'bubble-chat',
        labelKey: 'nav.chat',
      },
      { id: 'agent', path: '/agent', icon: 'robotic', labelKey: 'nav.agents' },
      {
        id: 'workflow',
        path: '/workflow',
        icon: 'flow-connection',
        labelKey: 'nav.workflows',
      },
    ],
  },
  {
    id: 'create',
    labelKey: 'nav.groups.create',
    items: [
      {
        id: 'text-to-image',
        path: '/text-to-image',
        icon: 'image-01',
        labelKey: 'nav.image',
      },
      {
        id: 'text-to-video',
        path: '/text-to-video',
        icon: 'video-replay',
        labelKey: 'nav.video',
      },
      {
        id: 'social',
        path: '/social',
        icon: 'share-08',
        labelKey: 'nav.social',
      },
    ],
  },
];

function translateGroup(
  group: NavGroupConfig,
  t: (key: string) => string,
): NavGroup {
  return {
    id: group.id,
    label: group.labelKey ? t(group.labelKey) : undefined,
    items: group.items.map((item) => ({
      id: item.id,
      path: item.path,
      icon: item.icon,
      label: t(item.labelKey),
    })),
  };
}

export function useNavItems() {
  const { t } = useI18n();
  const { isPersonalActive } = usePersonalWorkspace();

  // Mail lives in the personal workspace only.
  function visibleGroups(): NavGroupConfig[] {
    const topItems = isPersonalActive.value ? [mailItem, homeItem] : [homeItem];
    return [{ id: 'top', items: topItems }].concat(labelledGroups);
  }

  const navGroups = computed<NavGroup[]>(() =>
    visibleGroups().map((group) => translateGroup(group, t)),
  );

  function getAllItems(): TranslatedNavItem[] {
    return navGroups.value.flatMap((group) => group.items);
  }

  return { navGroups, getAllItems };
}
