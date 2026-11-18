<script setup lang="ts">
import { NuxtLinkLocale } from '#components';
import SocialPostManyTable from '~/features/social/components/SocialPostManyTable.vue';
import { useDeleteSocialPost } from '~/features/social/composables/useSocialPostApi';
import useSocialPostList from '~/features/social/composables/useSocialPostList';

// Composables
const { page, limit, useGetAllSocialPosts } = useSocialPostList();
const { data, error, isPending, refetch } = useGetAllSocialPosts();
const { mutateAsync: deleteSocialPost } = useDeleteSocialPost();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

useHead({
  title: t('social.list.title'),
});

// Computed
const meta = computed(() => data.value?.meta ?? { totalCount: 0 });
const hasNoPostsAtAll = computed(() => data.value?.meta.totalCount === 0);

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
              <Button
                :as="NuxtLinkLocale"
                to="/social/create"
                leading-icon="hugeicons:plus-sign"
              >
                {{ t('social.list.newPost') }}
              </Button>
            </template>
          </HeadingTitle>
        </template>
      </Heading>
      <div class="px-page pt-6 pb-10">
        <ListErrorAlert
          v-if="error && !data"
          :title="t('social.loadError.title')"
          :description="t('social.loadError.description')"
          @retry="refetch()"
        />
        <Empty v-else-if="hasNoPostsAtAll">
          <EmptyMedia variant="icon">
            <Icon name="hugeicons:share-08" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>{{ t('social.empty') }}</EmptyTitle>
            <EmptyDescription>
              {{ t('social.emptyDescription') }}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              :as="NuxtLinkLocale"
              to="/social/create"
              leading-icon="hugeicons:plus-sign"
            >
              {{ t('social.list.newPost') }}
            </Button>
          </EmptyContent>
        </Empty>
        <template v-else>
          <SocialPostManyTable
            :posts="data?.posts ?? []"
            :is-loading="isPending"
            @delete-post="handleDeletePost"
          />
          <ListPagination
            v-if="!isPending && meta.totalCount > 0"
            v-model:page="page"
            v-model:limit="limit"
            :total-count="meta.totalCount"
            noun="social.list.count"
          />
        </template>
      </div>
    </SectionWrapper>
  </PagePanel>
</template>
