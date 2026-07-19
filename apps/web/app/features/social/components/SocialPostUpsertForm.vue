<script setup lang="ts">
import { useForm } from '@tanstack/vue-form';
import { z } from 'zod';
import SocialPostMediaList from '~/features/social/components/SocialPostMediaList.vue';
import SocialPostPublishPanel from '~/features/social/components/SocialPostPublishPanel.vue';
import SocialPostStatusBadge from '~/features/social/components/SocialPostStatusBadge.vue';
import type { SocialPost } from '~/features/social/composables/useSocialPostApi';
import {
  usePublishSocialPost,
  useUpdateSocialPost,
} from '~/features/social/composables/useSocialPostApi';
import useUserSocialAccounts from '~/features/user/composables/useUserSocialAccounts';

const socialPostUpsertSchema = z.object({
  id: z.uuidv7(),
  content: z.string().refine((value) => value.trim().length > 0, {
    message: 'Post content cannot be empty.',
  }),
});

// Props
const props = defineProps<{
  post: SocialPost;
  workspaceId: string;
}>();

// Composables
const { t } = useI18n();
const { accounts, isLoading: isLoadingAccounts } = useUserSocialAccounts();
const { mutate: updatePost, isPending: isUpdating } = useUpdateSocialPost(
  () => props.workspaceId,
);
const { mutate: publishPost, isPending: isPublishing } = usePublishSocialPost(
  () => props.workspaceId,
);
const { formatDateTime } = useDateTimeFormat();

const form = useForm({
  defaultValues: {
    id: props.post.id,
    content: props.post.content,
  },
  validators: {
    onChange: socialPostUpsertSchema,
  },
  onSubmit: ({ value }) => updatePost({ id: value.id, content: value.content }),
});

// Computed
const canEdit = computed(() => props.post.status === 'draft');
const hasLinkedInConnected = computed(() =>
  accounts.value.some((account) => account.providerId === 'linkedin'),
);

// Functions
function handlePublish() {
  publishPost(props.post.id);
}
</script>

<template>
  <form class="max-w-2xl space-y-6" @submit.prevent.stop="form.handleSubmit">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <SocialPostStatusBadge :status="post.status" />
        <span class="text-xs text-muted-foreground">
          {{ formatDateTime(post.createdAt) }}
        </span>
      </div>
      <div class="flex gap-4">
        <Button as-child variant="secondary">
          <NuxtLinkLocale to="/social">
            {{ t('social.actions.cancel') }}
          </NuxtLinkLocale>
        </Button>
        <Button v-if="canEdit" type="submit" :disabled="isUpdating">
          <Spinner v-if="isUpdating" class="mr-2" />
          {{ t('social.actions.save') }}
        </Button>
      </div>
    </div>

    <form.Field name="content">
      <template v-slot="{ field, state }">
        <div class="space-y-2">
          <Textarea
            :id="field.name"
            rows="6"
            maxlength="3000"
            :disabled="!canEdit"
            :model-value="state.value"
            :placeholder="t('social.editor.contentPlaceholder')"
            class="text-sm"
            @update:model-value="
              (v: string | number) => field.handleChange(String(v))
            "
            @blur="field.handleBlur"
          />
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">
              {{ state.value.length }} / 3000
            </span>
          </div>
          <FormFieldInfo :state="state" />
        </div>
      </template>
    </form.Field>

    <SocialPostMediaList
      :post-id="post.id"
      :workspace-id="workspaceId"
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
  </form>
</template>
