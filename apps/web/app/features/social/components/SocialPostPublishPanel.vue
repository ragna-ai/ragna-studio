<script setup lang="ts">
// Imports
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import type { SocialPost } from '~/features/social/composables/useSocialPostApi';
import SocialPostLinkedInHint from '~/features/social/components/SocialPostLinkedInHint.vue';

// Props
const props = defineProps<{
  post: SocialPost;
  hasLinkedInConnected: boolean;
  isLoadingAccounts: boolean;
  isPublishing: boolean;
}>();

// Emits
const emit = defineEmits<{
  publish: [];
}>();

// Refs
// Composables
const { t } = useI18n();

// Computed
const canPublish = computed(
  () =>
    (props.post.status === 'draft' || props.post.status === 'failed') &&
    props.post.content.trim().length > 0,
);

// Functions
function handlePublish() {
  emit('publish');
}

// Hooks
</script>

<template>
  <div class="space-y-3">
    <SocialPostLinkedInHint
      v-if="!isLoadingAccounts && !hasLinkedInConnected"
    />

    <p
      v-if="post.status === 'failed' && post.publishError"
      class="text-sm text-destructive"
    >
      {{ post.publishError }}
    </p>

    <a
      v-if="post.status === 'published' && post.externalUrl"
      :href="post.externalUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="text-sm text-primary underline underline-offset-2"
    >
      {{ t('social.viewOnLinkedIn') }}
    </a>

    <Button v-if="canPublish" :disabled="isPublishing" @click="handlePublish">
      <Spinner v-if="isPublishing" class="mr-2" />
      {{ t('common.publish') }}
    </Button>
  </div>
</template>
