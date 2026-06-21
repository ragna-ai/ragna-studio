<script setup lang="ts">
import { Toaster } from '~/components/ui/sonner';
</script>

<template>
  <Html lang="en" dir="ltr" class="light">
    <Body class="bg-stone-50">
      <NavTopBar />
      <div class="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        <NavSidebar />
        <main
          id="main"
          class="relative max-w-[calc(100vw-4.5rem)] grow overflow-x-hidden overflow-y-auto rounded-xl border bg-white shadow-sm"
        >
          <slot />
        </main>
      </div>
      <Toaster position="top-right" rich-colors />
    </Body>
  </Html>
</template>
