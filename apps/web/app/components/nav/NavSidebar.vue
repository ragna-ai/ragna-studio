<script setup lang="ts">
import { useNavItems } from '~/composables/useNavItems';
import { useNavSidebarStore } from '~/stores/navsidebar.store';

const { navGroups } = useNavItems();
const navSidebarStore = useNavSidebarStore();
const collapsed = computed(() => !navSidebarStore.expanded);
</script>

<template>
  <SidebarShell :collapsed="collapsed">
    <template #header>
      <div class="pt-3 pb-3">
        <NavSideToggle />
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
      <div class="space-y-0.5 pt-2 pb-3">
        <NavNotifications :expanded="!collapsed" />
        <NavUserMenu :size-full="!collapsed" />
      </div>
    </template>
  </SidebarShell>
</template>
