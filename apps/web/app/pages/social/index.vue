<script setup lang="ts">
import SocialPostManyTable from '~/features/social/components/SocialPostManyTable.vue';
import { useDeleteSocialPost } from '~/features/social/composables/useSocialPostApi';
import useSocialPostList from '~/features/social/composables/useSocialPostList';

// Props
// Emits

// Refs

// Composables
const { page, limit, useGetAllSocialPosts } = useSocialPostList();
const { data, error: postsError } = useGetAllSocialPosts();
const { mutateAsync: deleteSocialPost } = useDeleteSocialPost();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('social.list.title'),
});

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });

// Functions
async function handleDeletePost(postId: string) {
  const confirmed = await confirm({
    title: t('social.deleteConfirm.title'),
    message: t('social.deleteConfirm.message'),
    confirmLabel: t('common.delete'),
    cancelLabel: t('common.cancel'),
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
  <PagePanel>
    <SectionWrapper>
      <Heading>
        <template #top>
          <HeadingTitle
            :title="t('social.list.title')"
            :subtitle="t('social.list.subtitle')"
          >
            <template #button>
              <Button variant="outline" as-child>
                <NuxtLinkLocale to="/social/create">
                  {{ t('social.list.newPost') }}
                </NuxtLinkLocale>
              </Button>
            </template>
          </HeadingTitle>
        </template>
      </Heading>
      <div v-if="data?.posts" class="px-page pt-6">
        <SocialPostManyTable
          :posts="data.posts"
          @delete-post="handleDeletePost"
        />
        <div class="pb-10">
          <ListPagination
            v-model:page="page"
            v-model:limit="limit"
            :total-count="meta.totalCount"
            noun="social.list.count"
          />
        </div>
      </div>
      <div v-else-if="postsError">
        <p class="text-sm text-stone-500">
          {{ postsError.message || t('social.loadError') }}
        </p>
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
