<script setup lang="ts">
import { BellIcon, MaximizeIcon } from '@lucide/vue';

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}
</script>

<template>
  <header class="flex h-14 items-center justify-between px-3">
    <div class="flex items-center gap-2">
      <NavTopPopover />
      <BrandLogo />
      <NavBarTeam />
    </div>
    <div class="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" class="rounded-lg text-stone-600">
        <BellIcon class="stroke-1.5 size-4" />
      </Button>
      <NavHelpMenu />
      <Button variant="ghost" size="icon-sm" class="rounded-lg text-stone-600" @click="toggleFullscreen">
        <MaximizeIcon class="stroke-1.5 size-4" />
      </Button>
      <NavUserMenu />
    </div>
  </header>
</template>
