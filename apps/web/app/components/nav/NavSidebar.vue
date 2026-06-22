<script setup lang="ts">
import { EllipsisIcon } from '@lucide/vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';
import { useNavItems } from '~/composables/useNavItems';

const { homeItem, defaultItems, moreItems } = useNavItems();
</script>

<template>
  <nav class="relative flex w-18 shrink-0 flex-col items-center gap-1 py-2">
    <NavLink
      :to="homeItem.path"
      :icon="homeItem.icon"
      :label="homeItem.label"
      :exact="true"
    />

    <NavLink
      v-for="item in defaultItems"
      :key="item.id"
      :to="item.path"
      :icon="item.icon"
      :label="item.label"
    />
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <button
          class="flex w-full flex-col items-center justify-center gap-1 rounded-lg py-2 text-stone-600 transition-colors hover:bg-stone-100"
        >
          <EllipsisIcon class="stroke-1.5 size-5" />
          <span class="text-[10px] leading-none font-medium">More</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="start" class="w-[5.5rem] min-w-0 p-2">
        <DropdownMenuItem v-for="item in moreItems" :key="item.id" as-child class="focus:bg-transparent gap-0 cursor-pointer p-0">
          <NavLink :to="item.path" :icon="item.icon" :label="item.label" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </nav>
</template>
