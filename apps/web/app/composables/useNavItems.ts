import {
  BotIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderClockIcon,
  HomeIcon,
  ImageIcon,
  ListTodoIcon,
  MessagesSquareIcon,
  PlusCircleIcon,
  Share2Icon,
  WorkflowIcon,
} from '@lucide/vue';
import type { Component } from 'vue';
import { computed } from 'vue';

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
    icon: DatabaseIcon,
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

const chatItems: NavItemConfig[] = [
  {
    id: 'chat-new',
    path: '/chat',
    icon: PlusCircleIcon,
    labelKey: 'nav.new',
    children: [],
  },
  {
    id: 'chat-history',
    path: '/chat/history',
    icon: FolderClockIcon,
    labelKey: 'nav.history',
    children: [],
  },
  {
    id: 'agent',
    path: '/agent',
    icon: BotIcon,
    labelKey: 'nav.agents',
    children: [],
  },
];

const agentItems: NavItemConfig[] = [
  {
    id: 'agent-create',
    path: '/agent/create',
    icon: PlusCircleIcon,
    labelKey: 'common.create',
    children: [],
  },
  {
    id: 'agent',
    path: '/agent',
    icon: BotIcon,
    labelKey: 'nav.agents',
    children: [],
  },
];

const workflowItems: NavItemConfig[] = [
  {
    id: 'workflow-create',
    path: '/workflow/create',
    icon: PlusCircleIcon,
    labelKey: 'common.create',
    children: [],
  },
  {
    id: 'workflow',
    path: '/workflow',
    icon: WorkflowIcon,
    labelKey: 'nav.workflows',
    children: [],
  },
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
  const route = useRoute();
  const { t } = useI18n();

  const dynamicNavItems = computed<NavItem[]>(() => {
    // if (route.path.startsWith('/chat')) return translateItems([homeItem, ...chatItems], t);
    // if (route.path.startsWith('/agent')) return translateItems([homeItem, ...agentItems], t);
    // if (route.path.startsWith('/workflow')) return translateItems([homeItem, ...workflowItems], t);
    return translateItems([homeItem, ...defaultItems], t);
  });

  function getAllItems(): NavItem[] {
    return translateItems([homeItem, ...defaultItems], t).flatMap((item) =>
      item.path ? [item] : item.children.filter((child) => child.path),
    );
  }

  return { dynamicNavItems, getAllItems };
}
