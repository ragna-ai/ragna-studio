<script setup lang="ts">
import { SearchIcon } from '@lucide/vue';
import { Button } from '~/components/ui/button';

// Composables
const { t } = useI18n();
</script>

<template>
  <Button
    as-child
    variant="ghost"
    size="icon"
    :aria-label="t('chat.search.title')"
    :title="t('chat.search.title')"
  >
    <NuxtLinkLocale to="/chat/search">
      <SearchIcon class="size-4 stroke-1.5 opacity-75" />
    </NuxtLinkLocale>
  </Button>
</template>
