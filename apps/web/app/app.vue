<script setup lang="ts">
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
</template>
