<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner';
import 'vue-sonner/style.css';

// Props
// Emits

// Refs

// Composables

// Computed
// Functions

// Hooks
</script>

<template>
  <Html :lang="'en'" :dir="'ltr'" class="light">
    <Body class="bg-white">
      <!-- Main -->
      <main id="main" class="flex min-h-screen">
        <div class="sticky top-0 h-full">
          <SidebarMenu />
        </div>
        <div class="w-full">
          <!-- slot -->
          <slot />
        </div>
      </main>
      <!-- Toast -->
      <Toaster position="top-right" rich-colors />
    </Body>
  </Html>
</template>
