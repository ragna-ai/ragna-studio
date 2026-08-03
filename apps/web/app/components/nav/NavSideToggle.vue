<script setup lang="ts">
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from '@lucide/vue';

// Imports

// Props
// Emits

// Refs

// Composables
const navSidebarStore = useNavSidebarStore();

// Computed
// Functions

// Hooks
</script>

<template>
  <button
    type="button"
    class="nav-item flex items-center justify-center"
    :title="
      navSidebarStore.showLabels ? $t('nav.hideLabels') : $t('nav.showLabels')
    "
    @click="navSidebarStore.toggleLabels()"
  >
    <div class="nav-icon-wrapper opacity-50 hover:opacity-100">
      <PanelLeftCloseIcon
        v-if="navSidebarStore.showLabels"
        class="size-4 stroke-1.5"
      />
      <PanelLeftOpenIcon v-else class="size-4 stroke-1.5" />
    </div>
  </button>
</template>
