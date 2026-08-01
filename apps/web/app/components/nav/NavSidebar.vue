<script setup lang="ts">
import {
  EllipsisIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
} from '@lucide/vue';
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
import { useNavSidebarStore } from '~/stores/navsidebar.store';

const navBarRef = useTemplateRef('navBarRef');
const { dynamicNavItems } = useNavItems();
const navSidebarStore = useNavSidebarStore();
</script>

<template>
  <div
    ref="navBarRef"
    class="relative flex shrink-0 flex-col justify-between transition-all duration-300 ease-out"
    :class="navSidebarStore.showLabels ? 'w-18' : 'nav-labels-hidden w-14'"
  >
    <div
      class="relative h-full overflow-y-hidden transition-opacity duration-200 ease-in-out"
    >
      <div id="spacer" class="h-2"></div>
      <div class="flex h-full flex-col">
        <ul
          class="overflow-hidden"
          :class="navSidebarStore.showLabels ? 'space-y-2' : 'space-y-1.5'"
        >
          <template v-for="item in dynamicNavItems" :key="item.id">
            <li v-if="item.path" class="nav-item">
              <NavLink
                :to="item.path"
                :icon="item.icon!"
                :label="item.label!"
                :label-visible="navSidebarStore.showLabels"
              />
            </li>
            <li v-else-if="item.children.length > 0" class="nav-item">
              <DropdownMenu>
                <TooltipProvider
                  v-if="!navSidebarStore.showLabels"
                  :delay-duration="300"
                >
                  <Tooltip>
                    <TooltipTrigger as-child>
                      <DropdownMenuTrigger>
                        <div
                          class="group flex flex-col items-center rounded-lg border border-transparent px-4 transition-colors"
                        >
                          <div class="nav-icon-wrapper">
                            <EllipsisIcon class="size-4" />
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
                    class="group flex flex-col items-center rounded-lg border border-transparent px-4 transition-colors"
                  >
                    <div class="nav-icon-wrapper">
                      <EllipsisIcon class="size-4" />
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
    <div class="flex w-full flex-col items-center pb-4">
      <button
        type="button"
        class="nav-item flex items-center justify-center"
        :title="
          navSidebarStore.showLabels
            ? $t('nav.hideLabels')
            : $t('nav.showLabels')
        "
        @click="navSidebarStore.toggleLabels()"
      >
        <div class="nav-icon-wrapper opacity-50 hover:opacity-100">
          <PanelLeftCloseIcon
            v-if="navSidebarStore.showLabels"
            class="size-4 stroke-1.5"
          />
          <PanelLeftOpenIcon v-else class="size-4 stroke-1.5" />
        </div>
      </button>
    </div>
  </div>
</template>
