<script setup lang="ts">
import type { HomeOverviewDocumentItem } from '~/features/home/types';

// Props
defineProps<{ documents: HomeOverviewDocumentItem[] }>();

// Composables
const { locale } = useI18n();
</script>

<template>
  <div class="divide-y divide-foreground/5">
    <NuxtLinkLocale
      v-for="document in documents"
      :key="document.id"
      :to="`/document/${document.id}`"
      class="flex items-center gap-3 px-6 py-2.5 text-sm hover:bg-accent"
    >
      <span class="grow truncate font-medium text-foreground">{{
        document.title
      }}</span>
      <NuxtTime
        :datetime="document.updatedAt"
        :locale="locale"
        relative
        class="shrink-0 text-xs whitespace-nowrap text-muted-foreground"
      />
    </NuxtLinkLocale>
  </div>
</template>
