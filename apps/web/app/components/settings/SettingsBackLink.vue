<script setup lang="ts">
import { ArrowLeftIcon } from '@lucide/vue';
import { readReturnPath } from '~/lib/settings-return-path';

const returnPath = ref('/');

onMounted(() => {
  returnPath.value = readReturnPath();
});
</script>

<template>
  <NuxtLink :to="returnPath" class="sidebar-row mt-3 mb-3">
    <ArrowLeftIcon class="sidebar-row-icon" />
    {{ $t('settings.backToApp') }}
  </NuxtLink>
</template>
