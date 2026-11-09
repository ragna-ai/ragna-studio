<script setup lang="ts">
const route = useRoute();
const { getAllItems } = useNavItems();
const state = usePageBreadcrumbState();

function isInSection(path: string): boolean {
  if (path === '/') return route.path === '/';
  return route.path === path || route.path.startsWith(`${path}/`);
}

const crumbs = computed<PageCrumb[]>(() => {
  const pageCrumbs = state.value.crumbs.filter((crumb) => crumb.label !== '');
  if (pageCrumbs.length > 0) return pageCrumbs;
  const section = getAllItems().find((item) => isInSection(item.path));
  return section ? [{ label: section.label }] : [];
});
</script>

<template>
  <Breadcrumb class="min-w-0">
    <BreadcrumbList class="flex-nowrap gap-1 text-body sm:gap-1">
      <template v-for="(crumb, index) in crumbs" :key="index">
        <BreadcrumbItem class="min-w-0 not-last:shrink-0">
          <BreadcrumbPage
            v-if="index === crumbs.length - 1"
            class="truncate font-medium text-foreground"
          >
            {{ crumb.label }}
          </BreadcrumbPage>
          <BreadcrumbLink
            v-else-if="crumb.to"
            as-child
            class="text-muted-foreground"
          >
            <NuxtLinkLocale :to="crumb.to">{{ crumb.label }}</NuxtLinkLocale>
          </BreadcrumbLink>
          <span v-else class="text-muted-foreground">{{ crumb.label }}</span>
        </BreadcrumbItem>
        <BreadcrumbSeparator v-if="index < crumbs.length - 1" class="text-icon">
          <Icon name="hugeicons:arrow-right-01" class="size-3.5" />
        </BreadcrumbSeparator>
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
