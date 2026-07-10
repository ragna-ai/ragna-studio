<script setup lang="ts">
import {
  BotIcon,
  DatabaseIcon,
  FolderIcon,
  ImageIcon,
  LayoutGridIcon,
  ListTodoIcon,
  MessagesSquareIcon,
  PieChartIcon,
  WorkflowIcon,
} from '@lucide/vue';

const quickAccessItems = [
  {
    id: 5,
    icon: MessagesSquareIcon,
    class: 'bg-indigo-200/50',
    label: 'Chat',
    route: '/chat',
  },
  {
    id: 3,
    icon: ListTodoIcon,
    class: 'bg-amber-200/50',
    label: 'Cowork',
    route: '/cowork',
  },
  {
    id: 6,
    icon: WorkflowIcon,
    class: 'bg-cyan-200/50',
    label: 'Workflows',
    route: '/workflow',
  },
  {
    id: 7,
    icon: BotIcon,
    class: 'bg-violet-200/50',
    label: 'Agents',
    route: '/agent',
  },
  {
    id: 8,
    icon: ImageIcon,
    class: 'bg-fuchsia-200/50',
    label: 'Image Generator',
    route: '/text-to-image',
  },
  {
    id: 10,
    icon: DatabaseIcon,
    class: 'bg-lime-200/50',
    label: 'Knowledge',
    route: '/collection',
  },
  {
    id: 11,
    icon: PieChartIcon,
    class: 'bg-blue-200/50',
    label: 'Analytics',
    route: '/account/statistics',
  },
  {
    id: 12,
    icon: FolderIcon,
    class: 'bg-slate-200/50',
    label: 'Files',
    route: '/storage',
  },
];
</script>

<template>
  <div class="pt-5">
    <div class="flex items-center space-x-2 pb-5">
      <LayoutGridIcon class="size-5 stroke-1.5" />
      <h2 class="text-2xl font-semibold">Quick Access</h2>
    </div>
    <div class="flex flex-wrap gap-4">
      <NuxtLink
        v-for="item in quickAccessItems"
        :key="item.id"
        :to="item.route"
      >
        <div
          class="group h-40 w-60 space-y-2 rounded-2xl p-5 hover:shadow-md"
          :class="item.class"
        >
          <component
            :is="item.icon"
            class="size-6 stroke-1.5 group-hover:stroke-2"
          />
          <p class="text-xs font-medium group-hover:font-semibold">
            {{ item.label }}
          </p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
