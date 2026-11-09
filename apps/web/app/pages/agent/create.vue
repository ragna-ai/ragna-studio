<script setup lang="ts">
import AgentUpsertForm from '~/features/agent/components/AgentUpsertForm.vue';

// Imports

// Props
// Emits

// Refs

// Composables
const { t } = useI18n();

useHead({
  title: t('agent.upsert.title'),
});

// Computed
usePageBreadcrumb(() => [
  { label: t('agent.list.title'), to: '/agent' },
  { label: t('agent.upsert.title') },
]);

// Functions

// Hooks
</script>

<template>
  <SectionWrapper class="h-full">
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="$t('agent.upsert.title')"
          :subtitle="$t('agent.upsert.subtitle')"
        />
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="flex min-h-0 flex-1 flex-col px-10 pb-8">
      <AgentUpsertForm />
    </div>
  </SectionWrapper>
</template>
