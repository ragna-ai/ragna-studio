<script setup lang="ts">
useHead({ title: 'Home' });
</script>

<template>
  <div class="h-full">
    <div class="p-4">
      <div class="h-44 rounded-xl bg-linear-to-br from-blue-50 to-indigo-100" />
    </div>
    <div class="mx-auto max-w-300 px-20">
      <HomeQuickAccess />
      <div class="py-10">
        <HomeFavorites />
      </div>
    </div>
  </div>
</template>
