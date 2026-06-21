<script setup lang="ts">
import { GripIcon } from '@lucide/vue';
import { useNavItems } from '~/composables/useNavItems';

// --- Composables
const { homeItem, defaultItems, moreItems } = useNavItems();

// --- Computed
const allItems = computed(() => [homeItem, ...defaultItems, ...moreItems]);
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon-sm" class="rounded-lg text-stone-600">
        <GripIcon class="stroke-1.5 size-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-64 p-3" side="right" align="start">
      <div class="grid grid-cols-3 gap-1">
        <NavLink
          v-for="item in allItems"
          :key="item.id"
          :to="item.path"
          :icon="item.icon"
          :label="item.label"
          :exact="item.id === 'home'"
        />
      </div>
    </PopoverContent>
  </Popover>
</template>
