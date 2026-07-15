<script setup lang="ts">
import { MaximizeIcon } from '@lucide/vue';

const onExpandClick = () => {
  const rootNode = document.documentElement;
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    rootNode.requestFullscreen();
  }
};
</script>

<template>
  <div class="flex h-14 items-center justify-between border-0">
    <div class="flex">
      <div class="ml-[0.1rem] px-6 mt-1">
        <NavTopPopover />
      </div>
      <div class="pl-2 flex items-center space-x-2 text-sm">
        <div class="">
          <BrandLogo :text-visible="true" />
        </div>
        <div></div>
        <div>
          <NavBarTeam />
        </div>
        <div></div>
      </div>
    </div>
    <div class="flex h-full items-center space-x-5">
      <NavNotifications />
      <div>
        <NavHelpMenu />
      </div>
      <button @click="onExpandClick">
        <MaximizeIcon class="size-5 stroke-1 hover:stroke-1.5" />
      </button>
      <div class="pr-5">
        <NavUserMenu :size-full="false" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.nav-icon {
  width: 1.4rem;
  height: 1.4rem;
}
</style>
