<script setup lang="ts">
import { VueQueryDevtools } from '@tanstack/vue-query-devtools';
import 'vue-sonner/style.css';
</script>

<template>
  <!--
  <NuxtPwaManifest />
  -->
  <ErrorAlert />
  <ConfirmDialog />
  <NuxtRouteAnnouncer />
  <NuxtLoadingIndicator />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <VueQueryDevtools />
</template>
