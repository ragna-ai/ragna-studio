<script setup lang="ts">
import { EllipsisIcon } from '@lucide/vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { Separator } from '~/components/ui/separator';
import { useNavItems } from '~/composables/useNavItems';

const navBarRef = useTemplateRef('navBarRef');
const { dynamicNavItems } = useNavItems();
</script>

<template>
  <div
    ref="navBarRef"
    class="relative flex w-18 shrink-0 flex-col justify-between transition-all duration-300 ease-out"
  >
    <div
      class="relative h-full overflow-y-hidden transition-opacity duration-200 ease-in-out"
    >
      <div id="spacer" class="h-2"></div>
      <div class="flex h-full flex-col">
        <ul class="space-y-2 overflow-hidden">
          <template v-for="item in dynamicNavItems" :key="item.id">
            <li v-if="item.path" class="nav-item">
              <NavLink
                :to="item.path"
                :icon="item.icon!"
                :label="item.label!"
              />
            </li>
            <li v-else-if="item.children.length > 0" class="nav-item">
              <DropdownMenu>
                <DropdownMenuTrigger>
                  <div
                    class="group flex flex-col items-center rounded-lg border border-transparent px-4 transition-colors"
                  >
                    <div class="nav-icon-wrapper">
                      <EllipsisIcon class="size-4" />
                    </div>
                    <span
                      class="nav-icon-text truncate px-4 pt-0 text-foreground"
                      >More</span
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
  </div>
</template>
