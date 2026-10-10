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

interface NavItemConfig {
  id: string;
  path?: string;
  icon?: Component;
  labelKey?: string;
  children: NavItemConfig[];
}

export interface NavItem {
  id: string;
  path?: string;
  icon?: Component;
  label?: string;
  children: NavItem[];
}

const mailItem: NavItemConfig = {
  id: 'mail',
  path: '/mail',
  icon: MailIcon,
  labelKey: 'nav.mail',
  children: [],
};

const homeItem: NavItemConfig = {
  id: 'home',
  path: '/',
  icon: HomeIcon,
  labelKey: 'nav.home',
  children: [],
};

const defaultItems: NavItemConfig[] = [
  {
    id: 'tasks',
    path: '/tasks',
    icon: ListTodoIcon,
    labelKey: 'nav.tasks',
    children: [],
  },
  {
    id: 'workflow',
    path: '/workflow',
    icon: WorkflowIcon,
    labelKey: 'nav.workflows',
    children: [],
  },
  {
    id: 'agent',
    path: '/agent',
    icon: BotIcon,
    labelKey: 'nav.agents',
    children: [],
  },
  {
    id: 'chat',
    path: '/chat',
    icon: MessagesSquareIcon,
    labelKey: 'nav.chat',
    children: [],
  },
  {
    id: 'dataset',
    path: '/dataset',
    icon: TableIcon,
    labelKey: 'nav.datasets',
    children: [],
  },
  {
    id: 'document',
    path: '/document',
    icon: FileTextIcon,
    labelKey: 'nav.docs',
    children: [],
  },
  {
    id: 'text-to-image',
    path: '/text-to-image',
    icon: ImageIcon,
    labelKey: 'nav.image',
    children: [],
  },
  {
    id: 'text-to-video',
    path: '/text-to-video',
    icon: VideoIcon,
    labelKey: 'nav.video',
    children: [],
  },
  {
    id: 'social',
    path: '/social',
    icon: Share2Icon,
    labelKey: 'nav.social',
    children: [],
  },
  // { id: 'sep-1', children: [] },
  // {
  //   id: 'more',
  //   children: [
  //     {
  //       id: 'collection',
  //       path: '/collection',
  //       icon: DatabaseIcon,
  //       labelKey: 'nav.collections',
  //       children: [],
  //     },
  //     {
  //       id: 'media',
  //       path: '/media',
  //       icon: FolderIcon,
  //       labelKey: 'nav.media',
  //       children: [],
  //     },
  //     {
  //       id: 'analytics',
  //       path: '/account/statistics',
  //       icon: PieChartIcon,
  //       labelKey: 'nav.analytics',
  //       children: [],
  //     },
  //   ],
  // },
];

function translateItems(
  items: NavItemConfig[],
  t: (key: string) => string,
): NavItem[] {
  return items.map((item) => ({
    id: item.id,
    path: item.path,
    icon: item.icon,
    label: item.labelKey ? t(item.labelKey) : undefined,
    children: translateItems(item.children, t),
  }));
}

export function useNavItems() {
  const { t } = useI18n();
  const { isPersonalActive } = usePersonalWorkspace();

  // Mail lives in the personal workspace only.
  function visibleItems(): NavItemConfig[] {
    if (isPersonalActive.value) return [mailItem, homeItem, ...defaultItems];
    return [homeItem, ...defaultItems];
  }

  const dynamicNavItems = computed<NavItem[]>(() => {
    return translateItems(visibleItems(), t);
  });

  function getAllItems(): NavItem[] {
    return translateItems(visibleItems(), t).flatMap((item) =>
      item.path ? [item] : item.children.filter((child) => child.path),
    );
  }

  return { dynamicNavItems, getAllItems };
}
