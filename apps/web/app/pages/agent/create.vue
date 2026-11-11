<script setup lang="ts">
import AgentUpsertForm from '~/features/agent/components/AgentUpsertForm.vue';

// Imports

// Props
// Emits

// Refs

// Composables
const { t } = useI18n();

useHead({
  title: t('agent.list.newAgent'),
});

// Computed
const crumbs = computed<PageCrumb[]>(() => [
  { label: t('agent.list.title'), to: '/agent' },
  { label: t('agent.list.newAgent') },
]);

// Functions

// Hooks
</script>

<template>
  <PagePanel :crumbs="crumbs">
    <SectionWrapper class="h-full">
      <div class="flex min-h-0 flex-1 flex-col px-page py-8">
        <AgentUpsertForm />
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
