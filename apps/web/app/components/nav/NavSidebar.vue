<script setup lang="ts">
import { useNavItems } from '~/composables/useNavItems';
import WorkspaceSwitcher from '~/features/workspace/components/WorkspaceSwitcher.vue';
import { useNavSidebarStore } from '~/stores/navsidebar.store';

const { navGroups } = useNavItems();
const navSidebarStore = useNavSidebarStore();
const collapsed = computed(() => !navSidebarStore.expanded);
</script>

<template>
  <SidebarShell :collapsed="collapsed">
    <template #header>
      <div class="space-y-2.5 pb-2.5">
        <WorkspaceSwitcher :collapsed="collapsed" />
        <NavSearch :collapsed="collapsed" />
      </div>
    </template>
    <nav :aria-label="$t('nav.title')">
      <SidebarGroup
        v-for="group in navGroups"
        :key="group.id"
        :label="group.label"
        :collapsed="collapsed"
      >
        <SidebarItem
          v-for="item in group.items"
          :key="item.id"
          :to="item.path"
          :icon="item.icon"
          :label="item.label"
          :collapsed="collapsed"
        />
      </SidebarGroup>
    </nav>
    <template #footer>
      <div class="space-y-0.5">
        <NavNotifications :expanded="!collapsed" />
        <NavUserMenu :size-full="!collapsed" />
      </div>
    </template>
  </SidebarShell>
</template>
