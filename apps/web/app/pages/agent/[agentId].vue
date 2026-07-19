<script setup lang="ts">
import AgentUpsertForm from '~/features/agent/components/AgentUpsertForm.vue';
import { useGetAgent } from '~/features/agent/composables/useAgentApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

// Imports

definePageMeta({
  validate: (route) => hasValidAgentId(route.params),
});

const route = useRoute();
const agentId = computed(() => route.params.agentId as string);

// Props
// Emits

// Refs

// Composables
// A workspace is always active (docs/api-standards/prd.md).
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { data, error: agentError } = useGetAgent(activeWorkspaceId, agentId);
const { t } = useI18n();

useHead({
  title: t('agent.upsert.title'),
});

// Computed
const breadcrumbItems = computed(() => [
  { label: t('agent.list.title'), to: '/agent' },
  { label: data.value?.agent.name ?? t('agent.upsert.title') },
]);

// Functions

// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="$t('agent.upsert.title')"
          :subtitle="$t('agent.upsert.subtitle')"
        >
          <template #title>
            <PageBreadcrumb :items="breadcrumbItems" />
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-20">
      <AgentUpsertForm v-if="data?.agent" v-bind="data.agent" />
    </div>
  </SectionWrapper>
</template>
