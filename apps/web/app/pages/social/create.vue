<script setup lang="ts">
import { Shimmer } from '~/components/ai-elements/shimmer';
import { useCreateSocialPost } from '~/features/social/composables/useSocialPostApi';

// Props
// Emits

// Refs

// Composables
const { mutate: createPost, isError } = useCreateSocialPost();
const { t } = useI18n();

useHead({
  title: t('social.create.title'),
});

// Computed
const breadcrumbItems = computed(() => [
  { label: t('social.list.title'), to: '/social' },
  { label: t('social.create.title') },
]);

// Functions
// Hooks

// A post needs an ID before media can be attached to it, so the draft is
// created immediately and the user is handed off to the same upsert form
// used for editing (`/social/[postId]`) rather than filling out a
// content-only form here first.
onMounted(() => {
  createPost('', {
    onSuccess: ({ post }) =>
      navigateTo(`/social/${post.id}`, { replace: true }),
  });
});
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="t('social.create.title')"
          :subtitle="t('social.create.subtitle')"
        >
          <template #title>
            <PageBreadcrumb :items="breadcrumbItems" />
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="flex justify-center py-12">
      <p v-if="isError" class="text-sm text-destructive">
        {{ t('social.toast.createError') }}
      </p>
      <Shimmer v-else class="h-6 w-48">
        {{ t('social.create.creating') }}
      </Shimmer>
    </div>
  </SectionWrapper>
</template>
