<script setup lang="ts">
import { GripIcon } from '@lucide/vue';
import { useNavItems } from '~/composables/useNavItems';

const open = ref(false);
const { getAllItems } = useNavItems();
const setClose = () => (open.value = false);
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger class="h-full group">
      <GripIcon
        class="nav-icon stroke-1.5 group-hover:stroke-2 group-hover:scale-105 transition-transform"
      />
    </PopoverTrigger>
    <PopoverContent align="start" class="size-96 p-5">
      <div class="grid grid-cols-3 gap-5">
        <template v-for="item in getAllItems()" :key="item.path">
          <NuxtLink
            v-if="item.path"
            :to="item.path"
            class="size-20 border-0 flex flex-col items-center justify-center space-y-2"
            @click="setClose"
          >
            <div class="size-12 border rounded-sm flex flex-col items-center justify-center">
              <component :is="item.icon" class="stroke-1.5 size-5" />
            </div>
            <span class="text-xs">{{ item.label }}</span>
          </NuxtLink>
        </template>
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
.nav-icon {
  width: 1.4rem;
  height: 1.4rem;
}
</style>
