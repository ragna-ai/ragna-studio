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
    <Body class="bg-stone-50">
      <!-- 
      <NavTopBar />
      -->
      <OrganizationDeletedScreen
        v-if="organization?.deletedAt"
        :organization-name="organization.name"
        :role="organization.role"
        :deleted-at="organization.deletedAt"
      />
      <div v-else class="flex h-screen overflow-hidden">
        <NavSidebar />
        <SidePanelHost />
        <main
          id="main"
          class="relative min-w-0 grow overflow-x-hidden overflow-y-auto rounded-xl border bg-white shadow-sm"
        >
          <WorkspaceEmptyState v-if="hasNoWorkspace" />
          <slot v-else />
        </main>
      </div>
      <Toaster position="top-center" rich-colors />
    </Body>
  </Html>
</template>
