<script setup lang="ts">
import { Toaster } from '~/components/ui/sonner';

const head = useLocaleHead();
</script>

<template>
  <Html :lang="head.htmlAttrs.lang" :dir="head.htmlAttrs.dir" class="light">
    <Body class="bg-stone-50">
      <NavTopBar />
      <div class="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        <NavSidebar />
        <SidePanelHost />
        <main
          id="main"
          class="relative min-w-0 grow overflow-x-hidden overflow-y-auto rounded-xl border bg-white shadow-sm"
        >
          <slot />
        </main>
      </div>
      <Toaster position="top-center" rich-colors />
    </Body>
  </Html>
</template>
