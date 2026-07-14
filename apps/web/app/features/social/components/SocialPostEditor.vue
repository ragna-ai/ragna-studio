<script setup lang="ts">
// Imports
import SocialPostContentForm from '~/features/social/components/SocialPostContentForm.vue';
import SocialPostMediaList from '~/features/social/components/SocialPostMediaList.vue';
import SocialPostPublishPanel from '~/features/social/components/SocialPostPublishPanel.vue';
import SocialPostStatusBadge from '~/features/social/components/SocialPostStatusBadge.vue';
import type { SocialPost } from '~/features/social/composables/useSocialPostApi';
import {
  usePublishSocialPost,
  useUpdateSocialPost,
} from '~/features/social/composables/useSocialPostApi';
import useUserSocialAccounts from '~/features/user/composables/useUserSocialAccounts';

// Props
const props = defineProps<{
  post: SocialPost;
}>();

// Emits
// Refs

// Composables
const { accounts, isLoading: isLoadingAccounts } = useUserSocialAccounts();
const { mutate: updatePost, isPending: isUpdating } = useUpdateSocialPost();
const { mutate: publishPost, isPending: isPublishing } = usePublishSocialPost();

// Computed
const canEdit = computed(() => props.post.status === 'draft');
const hasLinkedInConnected = computed(() =>
  accounts.value.some((account) => account.providerId === 'linkedin'),
);

// Functions
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDateTime(isoDate: string) {
  return dateTimeFormatter.format(new Date(isoDate));
}

function handleSaveContent(content: string) {
  updatePost({ id: props.post.id, content });
}

function handlePublish() {
  publishPost(props.post.id);
}

// Hooks
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <div class="flex items-center justify-between gap-3">
      <SocialPostStatusBadge :status="post.status" />
      <span class="text-xs text-muted-foreground">
        {{ formatDateTime(post.createdAt) }}
      </span>
    </div>

    <SocialPostContentForm
      :content="post.content"
      :disabled="!canEdit"
      :is-saving="isUpdating"
      @save="handleSaveContent"
    />

    <SocialPostMediaList
      :post-id="post.id"
      :media="post.media"
      :editable="canEdit"
    />

    <SocialPostPublishPanel
      :post="post"
      :has-linked-in-connected="hasLinkedInConnected"
      :is-loading-accounts="isLoadingAccounts"
      :is-publishing="isPublishing"
      @publish="handlePublish"
    />
  </div>
</template>
