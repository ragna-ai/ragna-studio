import {
  BotIcon,
  FileTextIcon,
  HomeIcon,
  ImageIcon,
  ListTodoIcon,
  MailIcon,
  MessagesSquareIcon,
  Share2Icon,
  TableIcon,
  VideoIcon,
  WorkflowIcon,
} from '@lucide/vue';
import type { Component } from 'vue';
import { computed } from 'vue';
import { usePersonalWorkspace } from '~/features/workspace/composables/usePersonalWorkspace';

interface NavItem {
  id: string;
  path: string;
  icon: Component;
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
  icon: Component;
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
  icon: MailIcon,
  labelKey: 'nav.mail',
};

const homeItem: NavItem = {
  id: 'home',
  path: '/',
  icon: HomeIcon,
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
        icon: ListTodoIcon,
        labelKey: 'nav.tasks',
      },
      {
        id: 'document',
        path: '/document',
        icon: FileTextIcon,
        labelKey: 'nav.docs',
      },
      {
        id: 'dataset',
        path: '/dataset',
        icon: TableIcon,
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
        icon: MessagesSquareIcon,
        labelKey: 'nav.chat',
      },
      { id: 'agent', path: '/agent', icon: BotIcon, labelKey: 'nav.agents' },
      {
        id: 'workflow',
        path: '/workflow',
        icon: WorkflowIcon,
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
        icon: ImageIcon,
        labelKey: 'nav.image',
      },
      {
        id: 'text-to-video',
        path: '/text-to-video',
        icon: VideoIcon,
        labelKey: 'nav.video',
      },
      {
        id: 'social',
        path: '/social',
        icon: Share2Icon,
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
