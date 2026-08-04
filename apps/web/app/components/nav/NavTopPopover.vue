<script setup lang="ts">
import { useNavItems } from '~/composables/useNavItems';

const open = ref(false);
const { getAllItems } = useNavItems();
const setClose = () => (open.value = false);
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger class="group h-full">
      <Icon
        name="rg-icon:ragna"
        class="size-[1.4rem] stroke-1.5 drop-shadow-sm transition-transform group-hover:scale-105 group-hover:stroke-2"
      />
    </PopoverTrigger>
    <PopoverContent align="start" class="size-96 p-5">
      <div class="grid grid-cols-3 gap-5">
        <template v-for="item in getAllItems()" :key="item.path">
          <NuxtLink
            v-if="item.path"
            :to="item.path"
            class="flex size-20 flex-col items-center justify-center space-y-2 border-0"
            @click="setClose"
          >
            <div
              class="flex size-12 flex-col items-center justify-center rounded-sm border"
            >
              <component :is="item.icon" class="size-5 stroke-1.5" />
            </div>
            <span class="text-xs">{{ item.label }}</span>
          </NuxtLink>
        </template>
      </div>
    </PopoverContent>
  </Popover>
</template>
