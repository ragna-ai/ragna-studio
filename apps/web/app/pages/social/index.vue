<script setup lang="ts">
// Imports
import SocialPostManyTable from '~/features/social/components/SocialPostManyTable.vue';
import {
  useCreateSocialPost,
  useDeleteSocialPost,
} from '~/features/social/composables/useSocialPostApi';
import useSocialPostList from '~/features/social/composables/useSocialPostList';

// Props
// Emits

// Refs

// Composables
const { page, limit, useGetAllSocialPosts } = useSocialPostList();
const { data, error: postsError } = useGetAllSocialPosts();
const { mutateAsync: deleteSocialPost } = useDeleteSocialPost();
const { mutateAsync: createSocialPost, isPending: isCreating } =
  useCreateSocialPost();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('social.list.title'),
});

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });

// Functions
async function handleNewPost() {
  const response = await createSocialPost();
  await navigateTo(`/social/${response.post.id}`);
}

async function handleDeletePost(postId: string) {
  const confirmed = await confirm({
    title: t('social.deleteConfirm.title'),
    message: t('social.deleteConfirm.message'),
    confirmLabel: t('social.deleteConfirm.confirm'),
    cancelLabel: t('social.deleteConfirm.cancel'),
    variant: 'destructive',
  });
  if (!confirmed) {
    return;
  }
  await deleteSocialPost(postId);
}

// Hooks
</script>

<template>
  <SectionWrapper>
    <Heading bg-position="bottom">
      <template #top>
        <HeadingTitle
          :title="t('social.list.title')"
          :subtitle="t('social.list.subtitle')"
        >
          <template #button>
            <Button
              variant="secondary"
              :disabled="isCreating"
              @click="handleNewPost"
            >
              <Spinner v-if="isCreating" class="mr-2" />
              {{ t('social.list.newPost') }}
            </Button>
          </template>
        </HeadingTitle>
      </template>
      <template #bottom> </template>
    </Heading>
    <div v-if="data?.posts" class="px-5">
      <SocialPostManyTable
        :posts="data.posts"
        :meta="meta"
        @delete-post="handleDeletePost"
      />
      <div class="pb-10">
        <PaginateControls
          v-if="meta.totalCount > 10"
          v-model:page="page"
          v-model:limit="limit"
          :meta="meta"
        />
      </div>
    </div>
    <div v-else-if="postsError">
      <p class="text-sm text-stone-500">
        {{ postsError.message || t('social.loadError') }}
      </p>
    </div>
    <div v-else>
      <p class="text-sm text-stone-500">{{ t('social.list.loading') }}</p>
    </div>
  </SectionWrapper>
</template>
