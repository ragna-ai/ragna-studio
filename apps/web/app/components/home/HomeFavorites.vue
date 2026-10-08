<script setup lang="ts">
import { StarIcon } from '@lucide/vue';

interface FavoriteAssistant {
  id: string;
  title: string;
  description: string;
}

const favoriteAssistants = shallowRef<FavoriteAssistant[]>([]);
const hasFavoriteAssistants = computed(
  () => favoriteAssistants.value.length > 0,
);
</script>

<template>
  <div v-if="hasFavoriteAssistants" class="flex flex-col">
    <div class="flex items-center space-x-2 pb-4">
      <StarIcon class="size-5 stroke-1.5" />
      <h2 class="text-2xl font-semibold">Favorites</h2>
    </div>
    <div class="flex flex-wrap gap-4 pb-4">
      <div
        v-for="item in favoriteAssistants"
        :key="item.id"
        class="flex h-40 w-80 shrink-0 space-x-2 rounded-2xl border p-4 hover:shadow-md"
      >
        <div class="flex w-52 flex-col justify-between py-1">
          <div class="space-y-1">
            <p class="truncate text-sm font-medium">{{ item.title }}</p>
            <p class="truncate text-xs">{{ item.description }}</p>
          </div>
          <button
            class="self-start rounded-lg border px-2 py-1 text-xs hover:bg-stone-200"
          >
            Start Chat
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
