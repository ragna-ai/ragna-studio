import {
  BotIcon,
  FolderClockIcon,
  HomeIcon,
  ImageIcon,
  MessagesSquareIcon,
  PlusCircleIcon,
  Share2Icon,
  WorkflowIcon,
} from '@lucide/vue';
import type { Component } from 'vue';
import { computed } from 'vue';

export interface NavItem {
  id: string;
  path?: string;
  icon?: Component;
  label?: string;
  children: NavItem[];
}

const homeItem: NavItem = {
  id: 'home',
  path: '/',
  icon: HomeIcon,
  label: 'Home',
  children: [],
};

const defaultItems: NavItem[] = [
  {
    id: 'workflow',
    path: '/workflow',
    icon: WorkflowIcon,
    label: 'Workflows',
    children: [],
  },
  {
    id: 'agent',
    path: '/agent',
    icon: BotIcon,
    label: 'Agents',
    children: [],
  },
  {
    id: 'chat',
    path: '/chat',
    icon: MessagesSquareIcon,
    label: 'Chat',
    children: [],
  },
  // {
  //   id: 'document',
  //   path: '/document',
  //   icon: FileTextIcon,
  //   label: 'Docs',
  //   children: [],
  // },
  {
    id: 'text-to-image',
    path: '/text-to-image',
    icon: ImageIcon,
    label: 'Image',
    children: [],
  },
  {
    id: 'social',
    path: '/social',
    icon: Share2Icon,
    label: 'Social',
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
  //       label: 'Collections',
  //       children: [],
  //     },
  //     {
  //       id: 'media',
  //       path: '/media',
  //       icon: FolderIcon,
  //       label: 'Media',
  //       children: [],
  //     },
  //     {
  //       id: 'analytics',
  //       path: '/account/statistics',
  //       icon: PieChartIcon,
  //       label: 'Analytics',
  //       children: [],
  //     },
  //   ],
  // },
];

const chatItems: NavItem[] = [
  {
    id: 'chat-new',
    path: '/chat',
    icon: PlusCircleIcon,
    label: 'New',
    children: [],
  },
  {
    id: 'chat-history',
    path: '/chat/history',
    icon: FolderClockIcon,
    label: 'History',
    children: [],
  },
  {
    id: 'agent',
    path: '/agent',
    icon: BotIcon,
    label: 'Agents',
    children: [],
  },
];

const agentItems: NavItem[] = [
  {
    id: 'agent-create',
    path: '/agent/create',
    icon: PlusCircleIcon,
    label: 'Create',
    children: [],
  },
  {
    id: 'agent',
    path: '/agent',
    icon: BotIcon,
    label: 'Agents',
    children: [],
  },
];

const workflowItems: NavItem[] = [
  {
    id: 'workflow-create',
    path: '/workflow/create',
    icon: PlusCircleIcon,
    label: 'Create',
    children: [],
  },
  {
    id: 'workflow',
    path: '/workflow',
    icon: WorkflowIcon,
    label: 'Workflows',
    children: [],
  },
];

export function useNavItems() {
  const route = useRoute();

  const dynamicNavItems = computed<NavItem[]>(() => {
    // if (route.path.startsWith('/chat')) return [homeItem, ...chatItems];
    // if (route.path.startsWith('/agent')) return [homeItem, ...agentItems];
    // if (route.path.startsWith('/workflow')) return [homeItem, ...workflowItems];
    return [homeItem, ...defaultItems];
  });

  function getAllItems(): NavItem[] {
    return [homeItem, ...defaultItems].flatMap((item) =>
      item.path ? [item] : item.children.filter((child) => child.path),
    );
  }

  return { dynamicNavItems, getAllItems };
}
