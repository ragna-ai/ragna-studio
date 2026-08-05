<script setup lang="ts">
import { EllipsisIcon } from '@lucide/vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Separator } from '~/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '~/components/ui/tooltip';
import { useNavItems } from '~/composables/useNavItems';
import WorkspaceSwitcher from '~/features/workspace/components/WorkspaceSwitcher.vue';
import { useNavSidebarStore } from '~/stores/navsidebar.store';

const navBarRef = useTemplateRef('navBarRef');
const { dynamicNavItems } = useNavItems();
const navSidebarStore = useNavSidebarStore();

// Tooltips (and the compact icon dock) only apply when the sidebar is
// collapsed and the "show labels when collapsed" account setting is off.
const labelsVisible = computed(
  () => navSidebarStore.expanded || navSidebarStore.showLabelsWhenCollapsed,
);
</script>

<template>
  <div
    ref="navBarRef"
    class="relative flex shrink-0 flex-col justify-between transition-all duration-300 ease-out"
    :class="
      navSidebarStore.expanded
        ? 'w-56'
        : navSidebarStore.showLabelsWhenCollapsed
          ? 'w-18'
          : 'nav-labels-hidden w-14'
    "
  >
    <div
      class="relative h-full overflow-y-hidden transition-opacity duration-200 ease-in-out"
    >
      <div
        class="flex justify-center px-2 pt-4 pb-3"
        :class="{ 'justify-start': navSidebarStore.expanded }"
      >
        <WorkspaceSwitcher size="sm" :size-full="navSidebarStore.expanded" />
      </div>
      <div class="flex grow flex-col">
        <ul
          class="overflow-hidden"
          :class="labelsVisible ? 'space-y-2' : 'space-y-1.5'"
        >
          <template v-for="item in dynamicNavItems" :key="item.id">
            <li v-if="item.path" class="nav-item">
              <NavLink
                :to="item.path"
                :icon="item.icon!"
                :label="item.label!"
                :expanded="navSidebarStore.expanded"
                :label-visible="navSidebarStore.showLabelsWhenCollapsed"
              />
            </li>
            <li v-else-if="item.children.length > 0" class="nav-item">
              <DropdownMenu>
                <TooltipProvider v-if="!labelsVisible" :delay-duration="300">
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <DropdownMenuTrigger>
                        <div class="nav-link group">
                          <div class="nav-icon-wrapper">
                            <EllipsisIcon class="nav-icon" />
                          </div>
                          <span
                            class="nav-icon-text truncate px-4 pt-0 text-foreground"
                            >{{ $t('nav.more') }}</span
                          >
                        </div>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {{ $t('nav.more') }}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuTrigger v-else>
                  <div
                    class="nav-link group"
                    :class="{ 'nav-link-expanded': navSidebarStore.expanded }"
                  >
                    <div class="nav-icon-wrapper">
                      <EllipsisIcon class="nav-icon" />
                    </div>
                    <span
                      class="nav-icon-text truncate px-4 pt-0 text-foreground"
                      >{{ $t('nav.more') }}</span
                    >
                  </div>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="right"
                  align="start"
                  :collision-boundary="navBarRef"
                  :avoid-collisions="true"
                  :collision-padding="{ left: 16 }"
                  class="w-22 min-w-0 p-2"
                >
                  <DropdownMenuItem
                    v-for="child in item.children"
                    :key="child.id"
                    class="nav-item-child cursor-pointer gap-0 p-0 focus:bg-transparent"
                    as-child
                  >
                    <NavLink
                      v-if="child.path"
                      :to="child.path"
                      :icon="child.icon!"
                      :label="child.label!"
                      :label-visible="true"
                    />
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
            <li v-else class="px-5">
              <Separator class="bg-stone-200" />
            </li>
          </template>
        </ul>
      </div>
    </div>
    <div class="flex w-full flex-col items-center space-y-3 pb-4">
      <!-- 
      <NavSideToggle />
      -->
      <NavNotifications />
      <NavUserMenu :size-full="false" />
    </div>
  </div>
</template>
