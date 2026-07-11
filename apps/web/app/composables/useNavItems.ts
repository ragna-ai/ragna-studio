import {
  BotIcon,
  DatabaseIcon,
  FileTextIcon,
  FolderIcon,
  HomeIcon,
  ImageIcon,
  MessagesSquareIcon,
  PieChartIcon,
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

export function useNavItems() {
  const dynamicNavItems = computed<NavItem[]>(() => [
    { id: 'home', path: '/', icon: HomeIcon, label: 'Home', children: [] },
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
    {
      id: 'document',
      path: '/document',
      icon: FileTextIcon,
      label: 'Docs',
      children: [],
    },
    {
      id: 'text-to-image',
      path: '/text-to-image',
      icon: ImageIcon,
      label: 'Image',
      children: [],
    },
    { id: 'sep-1', children: [] },
    {
      id: 'more',
      children: [
        {
          id: 'collection',
          path: '/collection',
          icon: DatabaseIcon,
          label: 'Collections',
          children: [],
        },
        {
          id: 'media',
          path: '/media',
          icon: FolderIcon,
          label: 'Media',
          children: [],
        },
        {
          id: 'analytics',
          path: '/account/statistics',
          icon: PieChartIcon,
          label: 'Analytics',
          children: [],
        },
      ],
    },
  ]);

  function getAllItems(): NavItem[] {
    return dynamicNavItems.value.flatMap((item) =>
      item.path ? [item] : item.children.filter((c) => c.path),
    );
  }

  return { dynamicNavItems, getAllItems };
}
