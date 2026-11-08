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
      <div v-else class="flex h-screen overflow-hidden p-shell pl-0">
        <NavSidebar />
        <div
          class="box-border flex min-w-0 grow overflow-hidden rounded-lg border bg-background shadow-xs"
        >
          <SidePanelHost />
          <div class="flex min-w-0 flex-1 flex-col">
            <PagePanel v-if="hasNoWorkspace">
              <WorkspaceEmptyState />
            </PagePanel>
            <slot v-else />
          </div>
        </div>
      </div>
      <Toaster position="top-center" rich-colors />
    </Body>
  </Html>
</template>
