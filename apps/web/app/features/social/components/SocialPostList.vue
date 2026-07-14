<script setup lang="ts">
// Imports
import { Spinner } from '~/components/ui/spinner';
import useUserSocialAccounts from '~/features/user/composables/useUserSocialAccounts';
import {
  useDeleteSocialPost,
  useGetSocialPosts,
  usePublishSocialPost,
  useUpdateSocialPost,
} from '~/features/social/composables/useSocialPostApi';
import SocialPostItem from '~/features/social/components/SocialPostItem.vue';
import SocialPostLinkedInHint from '~/features/social/components/SocialPostLinkedInHint.vue';

// Props
// Emits

// Refs

// Composables
const { data, isLoading, isError } = useGetSocialPosts();
const { accounts, isLoading: isLoadingAccounts } = useUserSocialAccounts();
const {
  mutate: updatePost,
  isPending: isUpdating,
  variables: updateVariables,
} = useUpdateSocialPost();
const {
  mutate: deletePost,
  isPending: isDeleting,
  variables: deletingId,
} = useDeleteSocialPost();
const {
  mutate: publishPost,
  isPending: isPublishing,
  variables: publishingId,
} = usePublishSocialPost();
const { confirm } = useConfirmDialog();
const { t } = useI18n();

// Computed
const posts = computed(() => data.value?.posts ?? []);
const hasLinkedInConnected = computed(() =>
  accounts.value.some((account) => account.providerId === 'linkedin'),
);

// Functions
function isRowPublishing(postId: string) {
  return isPublishing.value && publishingId.value === postId;
}

function isRowDeleting(postId: string) {
  return isDeleting.value && deletingId.value === postId;
}

function isRowUpdating(postId: string) {
  return isUpdating.value && updateVariables.value?.id === postId;
}

function handleUpdate(id: string, content: string) {
  updatePost({ id, content });
}

function handlePublish(id: string) {
  publishPost(id);
}

async function handleDelete(id: string) {
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
  deletePost(id);
}

// Hooks
</script>

<template>
  <div class="space-y-4">
    <SocialPostLinkedInHint v-if="!isLoadingAccounts && !hasLinkedInConnected" />

    <div v-if="isLoading" class="flex justify-center py-12">
      <Spinner />
    </div>
    <p v-else-if="isError" class="py-12 text-center text-sm text-destructive">
      {{ t('social.loadError') }}
    </p>
    <p v-else-if="posts.length === 0" class="py-12 text-center text-sm text-muted-foreground">
      {{ t('social.empty') }}
    </p>
    <ul v-else class="divide-y">
      <SocialPostItem
        v-for="post in posts"
        :key="post.id"
        :post="post"
        :is-publishing="isRowPublishing(post.id)"
        :is-deleting="isRowDeleting(post.id)"
        :is-updating="isRowUpdating(post.id)"
        @publish="handlePublish"
        @delete="handleDelete"
        @update="handleUpdate"
      />
    </ul>
  </div>
</template>
