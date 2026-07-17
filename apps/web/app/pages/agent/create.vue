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
const breadcrumbItems = computed(() => [
  { label: t('agent.list.title'), to: '/agent' },
  { label: t('agent.upsert.title') },
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
    <div class="px-10">
      <AgentUpsertForm />
    </div>
  </SectionWrapper>
</template>
