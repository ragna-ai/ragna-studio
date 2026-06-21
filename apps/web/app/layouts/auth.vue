<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner';
</script>

<template>
  <Html lang="en">
    <Head>
      <Title>RAGNA Studio</Title>
    </Head>

    <Body class="bg-background">
      <div class="h-screen lg:grid lg:grid-cols-2">
        <slot />
      </div>
      <Toaster position="top-right" rich-colors />
    </Body>
  </Html>
</template>
