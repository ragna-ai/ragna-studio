<script setup lang="ts">
import { Toaster } from '~/components/ui/sonner';
import OrganizationDeletedScreen from '~/features/organization/components/OrganizationDeletedScreen.vue';
import { useGetOrganization } from '~/features/organization/composables/useOrganizationApi';
import WorkspaceEmptyState from '~/features/workspace/components/WorkspaceEmptyState.vue';
import { useGetWorkspaces } from '~/features/workspace/composables/useWorkspaceApi';

const head = useLocaleHead();
const { data: organization } = useGetOrganization();
const { data: workspaceList } = useGetWorkspaces();

const hasNoWorkspace = computed(
  () => workspaceList.value?.workspaces.length === 0,
);
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
        <NavSidebar />
        <SidePanelHost />
        <div
          data-testid="shell-panel"
          class="@container box-border flex min-w-0 grow flex-col overflow-hidden rounded-lg border bg-background shadow-xs"
        >
          <div
            class="flex min-h-0 flex-1 flex-col @max-[1280px]:[--page-x:2rem]"
          >
            <NavTopBar />
            <main
              id="main"
              class="relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
            >
              <WorkspaceEmptyState v-if="hasNoWorkspace" />
              <slot v-else />
            </main>
          </div>
        </div>
      </div>
      <Toaster position="top-center" rich-colors />
    </Body>
  </Html>
</template>
