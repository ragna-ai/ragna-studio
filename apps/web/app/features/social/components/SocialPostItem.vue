<script setup lang="ts">
// Imports
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import type { SocialPost } from '~/features/social/composables/useSocialPostApi';
import SocialPostStatusBadge from '~/features/social/components/SocialPostStatusBadge.vue';

// Props
const props = defineProps<{
  post: SocialPost;
  isPublishing: boolean;
  isDeleting: boolean;
  isUpdating: boolean;
}>();

// Emits
const emit = defineEmits<{
  publish: [id: string];
  delete: [id: string];
  update: [id: string, content: string];
}>();

// Refs
const isEditing = ref(false);
const draftContent = ref(props.post.content);

// Composables
const { t } = useI18n();

// Computed
const canEdit = computed(() => props.post.status === 'draft');
const canPublish = computed(
  () => props.post.status === 'draft' || props.post.status === 'failed',
);

// Functions
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDateTime(isoDate: string) {
  return dateTimeFormatter.format(new Date(isoDate));
}

function startEditing() {
  draftContent.value = props.post.content;
  isEditing.value = true;
}

function cancelEditing() {
  isEditing.value = false;
}

function saveEditing() {
  emit('update', props.post.id, draftContent.value);
  isEditing.value = false;
}

function handlePublish() {
  emit('publish', props.post.id);
}

function handleDelete() {
  emit('delete', props.post.id);
}

// Hooks
</script>

<template>
  <li class="space-y-3 py-4 first:pt-0 last:pb-0">
    <div class="flex items-center justify-between gap-3">
      <SocialPostStatusBadge :status="post.status" />
      <span class="text-xs text-muted-foreground">{{ formatDateTime(post.createdAt) }}</span>
    </div>

    <Textarea
      v-if="isEditing"
      v-model="draftContent"
      rows="4"
      maxlength="3000"
      class="text-sm"
    />
    <p v-else class="line-clamp-4 text-sm whitespace-pre-line">{{ post.content }}</p>

    <p v-if="post.status === 'failed' && post.publishError" class="text-xs text-destructive">
      {{ post.publishError }}
    </p>

    <a
      v-if="post.status === 'published' && post.externalUrl"
      :href="post.externalUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="text-xs text-primary underline underline-offset-2"
    >
      {{ t('social.viewOnLinkedIn') }}
    </a>

    <div class="flex flex-wrap gap-2">
      <template v-if="isEditing">
        <Button size="sm" :disabled="isUpdating" @click="saveEditing">
          {{ t('social.actions.save') }}
        </Button>
        <Button size="sm" variant="outline" @click="cancelEditing">
          {{ t('social.actions.cancel') }}
        </Button>
      </template>
      <template v-else>
        <Button v-if="canEdit" size="sm" variant="outline" @click="startEditing">
          {{ t('social.actions.edit') }}
        </Button>
        <Button v-if="canPublish" size="sm" :disabled="isPublishing" @click="handlePublish">
          {{ t('social.actions.publish') }}
        </Button>
        <Button size="sm" variant="outline" :disabled="isDeleting" @click="handleDelete">
          {{ t('social.actions.delete') }}
        </Button>
      </template>
    </div>
  </li>
</template>
