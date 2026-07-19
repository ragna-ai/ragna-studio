<script setup lang="ts">
import { storeToRefs } from 'pinia';
import SocialPostUpsertForm from '~/features/social/components/SocialPostUpsertForm.vue';
import { useGetSocialPost } from '~/features/social/composables/useSocialPostApi';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';

definePageMeta({
  validate: (route) => hasValidSocialPostId(route.params),
});

// Props
// Emits
// Refs

const route = useRoute();
const postId = computed(() => route.params.postId as string);

// Composables
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { post, isLoading, isError } = useGetSocialPost(
  activeWorkspaceId,
  postId,
);
const { t } = useI18n();

useHead({
  title: t('social.editor.title'),
});

// Computed
const breadcrumbItems = computed(() => [
  { label: t('social.list.title'), to: '/social' },
  { label: t('social.editor.title') },
]);

// Functions
// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="t('social.editor.title')"
          :subtitle="t('social.editor.subtitle')"
        >
          <template #title>
            <PageBreadcrumb :items="breadcrumbItems" />
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-5 pb-10">
      <SocialPostUpsertForm
        v-if="post"
        :key="post.id"
        :post="post"
        :workspace-id="activeWorkspaceId"
      />
      <p v-else-if="isError" class="py-12 text-center text-sm text-destructive">
        {{ t('social.loadError') }}
      </p>
      <p v-else class="py-12 text-center text-sm text-muted-foreground">
        {{ t('social.editor.notFound') }}
      </p>
    </div>
  </SectionWrapper>
</template>
