<script setup lang="ts">
import { MaximizeIcon } from '@lucide/vue';
import ChatHeading from '~/features/chat/components/ChatHeading.vue';
import { useChatStore } from '~/features/chat/stores/chat.store';
import WorkspaceSwitcher from '~/features/workspace/components/WorkspaceSwitcher.vue';

const chatStore = useChatStore();

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
  <div class="grid h-14 grid-cols-3 items-center border-0">
    <div class="flex">
      <div class="mt-1 ml-[0.1rem] px-6">
        <NavTopPopover />
      </div>
      <div class="flex items-center space-x-2 pl-2 text-sm">
        <div class="">
          <BrandLogo :text-visible="true" />
        </div>
        <div></div>
        <div>
          <WorkspaceSwitcher />
        </div>
        <div></div>
      </div>
    </div>
    <div class="flex justify-center">
      <ChatHeading v-if="chatStore.id" />
    </div>
    <div class="flex h-full items-center justify-end space-x-5">
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
