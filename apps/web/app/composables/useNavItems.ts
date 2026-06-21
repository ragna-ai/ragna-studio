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

export interface NavItem {
  id: string;
  icon: Component;
  label: string;
  path: string;
}

export function useNavItems() {
  const homeItem: NavItem = {
    id: 'home',
    icon: HomeIcon,
    label: 'Home',
    path: '/',
  };

  const defaultItems: NavItem[] = [
    {
      id: 'workflow',
      icon: WorkflowIcon,
      label: 'Workflows',
      path: '/workflow',
    },
    {
      id: 'document',
      icon: FileTextIcon,
      label: 'Documents',
      path: '/document',
    },
    { id: 'chat', icon: MessagesSquareIcon, label: 'Chat', path: '/chat' },
    {
      id: 'text-to-image',
      icon: ImageIcon,
      label: 'Image',
      path: '/text-to-image',
    },
    { id: 'assistant', icon: BotIcon, label: 'Agents', path: '/assistant' },
  ];

  const moreItems: NavItem[] = [
    {
      id: 'collection',
      icon: DatabaseIcon,
      label: 'Collections',
      path: '/collection',
    },
    { id: 'media', icon: FolderIcon, label: 'Media', path: '/media' },
    {
      id: 'analytics',
      icon: PieChartIcon,
      label: 'Analytics',
      path: '/account/statistics',
    },
  ];

  return { homeItem, defaultItems, moreItems };
}
