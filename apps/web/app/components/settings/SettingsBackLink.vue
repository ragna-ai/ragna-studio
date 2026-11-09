<script setup lang="ts">
import { readReturnPath } from '~/lib/settings-return-path';

const returnPath = ref('/');

onMounted(() => {
  returnPath.value = readReturnPath();
});
</script>

<template>
  <NuxtLink :to="returnPath" class="sidebar-row mt-3 mb-3">
    <Icon name="hugeicons:arrow-left-01" class="sidebar-row-icon" />
    {{ $t('settings.backToApp') }}
  </NuxtLink>
</template>
