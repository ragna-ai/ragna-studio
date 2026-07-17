<script setup lang="ts">
export interface PageBreadcrumbItem {
  label: string;
  // Omit on the last (current) item, or on an item that isn't ready to
  // link yet (e.g. a loading placeholder).
  to?: string;
}

interface Props {
  items: PageBreadcrumbItem[];
}

defineProps<Props>();

// With a #current slot every `items` entry is an ancestor; the slot renders
// as the trailing item. Lets a page keep an interactive current item (e.g.
// an inline-rename field) that a static BreadcrumbPage can't express.
const slots = useSlots();
const hasCurrentSlot = computed(() => !!slots.current);
</script>

<template>
  <Breadcrumb>
    <BreadcrumbList class="flex-nowrap">
      <template v-for="(item, index) in items" :key="index">
        <BreadcrumbItem class="min-w-0">
          <!-- The current (last) item replaces the page title but stays at
               the standard compact breadcrumb size: bold/h1-sized made it
               read as a second title, not a trail. -->
          <BreadcrumbPage
            v-if="!hasCurrentSlot && index === items.length - 1"
            class="max-w-lg truncate font-medium text-foreground"
          >
            {{ item.label }}
          </BreadcrumbPage>
          <BreadcrumbLink v-else-if="item.to" as-child class="text-muted-foreground">
            <NuxtLinkLocale :to="item.to">{{ item.label }}</NuxtLinkLocale>
          </BreadcrumbLink>
          <span v-else class="text-muted-foreground">{{ item.label }}</span>
        </BreadcrumbItem>
        <BreadcrumbSeparator v-if="hasCurrentSlot || index < items.length - 1" />
      </template>
      <BreadcrumbItem v-if="hasCurrentSlot" class="min-w-0">
        <slot name="current" />
      </BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
</template>
