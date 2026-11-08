<template>
  <header
    :aria-label="$t('nav.topBar.label')"
    class="flex h-(--topbar-height) shrink-0 items-center gap-2 px-[calc(var(--page-x)-0.5rem)]"
  >
    <NavSideToggle />
    <div class="h-4 w-px shrink-0 bg-border" aria-hidden="true" />
    <NavBreadcrumb class="ml-3" />
    <div class="ml-auto flex shrink-0 items-center gap-2">
      <button
        type="button"
        class="flex size-8 items-center justify-center rounded-md text-icon"
        aria-disabled="true"
        :aria-label="$t('nav.topBar.favorite')"
      >
        <Icon name="hugeicons:star" class="size-4" />
      </button>
      <button
        type="button"
        class="flex size-8 items-center justify-center rounded-md text-icon"
        aria-disabled="true"
        :aria-label="$t('nav.topBar.moreActions')"
      >
        <Icon name="hugeicons:more-horizontal" class="size-4" />
      </button>
    </div>
  </header>
</template>
