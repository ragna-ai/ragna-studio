<script setup lang="ts">
import {
  BotIcon,
  DatabaseIcon,
  ImageIcon,
  MessagesSquareIcon,
  Share2Icon,
  WorkflowIcon,
} from '@lucide/vue';

const quickAccessItems = [
  {
    id: 5,
    icon: MessagesSquareIcon,
    class: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    label: 'Chat',
    route: '/chat',
  },
  // {
  //   id: 3,
  //   icon: ListTodoIcon,
  //   class: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  //   label: 'Cowork',
  //   route: '/cowork',
  // },
  {
    id: 6,
    icon: WorkflowIcon,
    class: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
    label: 'Workflows',
    route: '/workflow',
  },
  {
    id: 7,
    icon: BotIcon,
    class: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    label: 'Agents',
    route: '/agent',
  },
  {
    id: 8,
    icon: ImageIcon,
    class: 'bg-pink-500/10 text-pink-600 dark:text-pink-400',
    label: 'Image Generator',
    route: '/text-to-image',
  },
  // {
  //   id: 10,
  //   icon: DatabaseIcon,
  //   class: 'bg-lime-500/10 text-lime-600 dark:text-lime-400',
  //   label: 'Knowledge',
  //   route: '/collection',
  // },
  // {
  //   id: 11,
  //   icon: PieChartIcon,
  //   class: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  //   label: 'Analytics',
  //   route: '/account/statistics',
  // },
  // {
  //   id: 12,
  //   icon: FolderIcon,
  //   class: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  //   label: 'Files',
  //   route: '/storage',
  // },
  {
    id: 13,
    icon: Share2Icon,
    class: 'bg-lime-500/10 text-lime-600 dark:text-lime-400',
    label: 'Social',
    route: '/social',
  },
  {
    id: 14,
    icon: DatabaseIcon,
    class: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    label: 'Datasets',
    route: '/dataset',
  },
];
</script>

<template>
  <div class="pt-5">
    <div class="flex flex-wrap gap-4">
      <NuxtLinkLocale
        v-for="item in quickAccessItems"
        :key="item.id"
        :to="item.route"
      >
        <div
          class="group h-40 w-60 space-y-3 rounded-2xl border border-border bg-stone-50 p-5 hover:border-foreground/10 hover:shadow-sm"
        >
          <div
            class="flex size-10 items-center justify-center rounded-lg"
            :class="item.class"
          >
            <component :is="item.icon" class="size-5 stroke-1.5" />
          </div>
          <p class="text-xs font-medium">
            {{ item.label }}
          </p>
        </div>
      </NuxtLinkLocale>
    </div>
  </div>
</template>
