<script setup lang="ts">
// Imports
import { Shimmer } from '~/components/ai-elements/shimmer';
import SocialPostEditor from '~/features/social/components/SocialPostEditor.vue';
import { useGetSocialPost } from '~/features/social/composables/useSocialPostApi';

definePageMeta({
  title: 'Social Post',
  validate: (route) => hasValidSocialPostId(route.params),
});

// Props
// Emits
// Refs

const route = useRoute();
const postId = computed(() => route.params.postId as string);

// Composables
const { post, isLoading, isError } = useGetSocialPost(postId);
const { t } = useI18n();

useHead({
  title: t('social.editor.title'),
});

// Computed
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
        />
      </template>
      <template #bottom> </template>
    </Heading>
    <div class="px-5 pb-10">
      <SocialPostEditor v-if="post" :key="post.id" :post="post" />
      <p v-else-if="isError" class="py-12 text-center text-sm text-destructive">
        {{ t('social.loadError') }}
      </p>
      <div v-else-if="isLoading" class="flex justify-center py-12">
        <Shimmer class="h-6 w-48">{{ t('social.editor.loading') }}</Shimmer>
      </div>
      <p v-else class="py-12 text-center text-sm text-muted-foreground">
        {{ t('social.editor.notFound') }}
      </p>
    </div>
  </SectionWrapper>
</template>
