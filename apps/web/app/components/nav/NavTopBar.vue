<script setup lang="ts">
import { Button } from '~/components/ui/button';

defineProps<{ crumbs?: PageCrumb[]; hideSidebarToggle?: boolean }>();
</script>

<template>
  <header
    :aria-label="$t('nav.topBar.label')"
    class="flex h-topbar shrink-0 items-center gap-2 px-topbar-x"
    :class="{ 'pl-page': hideSidebarToggle }"
  >
    <template v-if="!hideSidebarToggle">
      <NavSideToggle />
      <div class="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
    </template>
    <div v-if="$slots.left" class="flex shrink-0 items-center gap-2">
      <slot name="left" />
    </div>
    <div
      class="flex min-w-0 items-center"
      :class="{ 'ml-3': !hideSidebarToggle }"
    >
      <slot>
        <NavBreadcrumb :crumbs="crumbs" />
      </slot>
    </div>
    <div class="ml-auto flex shrink-0 items-center gap-2">
      <slot name="right">
        <Button
          variant="ghost"
          size="icon"
          class="text-icon"
          aria-disabled="true"
          :aria-label="$t('nav.topBar.favorite')"
        >
          <Icon name="hugeicons:star" class="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="text-icon"
          aria-disabled="true"
          :aria-label="$t('nav.topBar.moreActions')"
        >
          <Icon name="hugeicons:more-horizontal" class="size-4" />
        </Button>
      </slot>
    </div>
  </header>
</template>
