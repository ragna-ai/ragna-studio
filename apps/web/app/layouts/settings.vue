<script setup lang="ts">
import { Toaster } from '~/components/ui/sonner';
import OrganizationDeletedScreen from '~/features/organization/components/OrganizationDeletedScreen.vue';
import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';

const head = useLocaleHead();
const { data: organization } = useGetOrganization();
const { navGroups } = useSettingsNavItems();
</script>

<template>
  <Html :lang="head.htmlAttrs.lang" :dir="head.htmlAttrs.dir" class="light">
    <Body class="bg-canvas">
      <OrganizationDeletedScreen
        v-if="organization?.deletedAt"
        :organization-name="organization.name"
        :role="organization.role"
        :deleted-at="organization.deletedAt"
      />
      <div v-else class="flex h-screen overflow-hidden p-(--shell-inset) pl-0">
        <SidebarShell>
          <template #header>
            <SettingsBackLink />
          </template>
          <nav :aria-label="$t('settings.title')">
            <SidebarGroup
              v-for="group in navGroups"
              :key="group.id"
              :label="group.label"
            >
              <SidebarItem
                v-for="item in group.items"
                :key="item.id"
                :to="item.path"
                :icon="item.icon"
                :label="item.label"
                :exact="item.exact"
              />
            </SidebarGroup>
          </nav>
        </SidebarShell>
        <div
          class="@container box-border flex min-w-0 grow flex-col overflow-hidden rounded-lg border bg-background shadow-xs"
        >
          <main
            id="main"
            class="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto @max-[1280px]:[--page-x:2rem]"
          >
            <slot />
          </main>
        </div>
      </div>
      <Toaster position="top-center" rich-colors />
    </Body>
  </Html>
</template>
