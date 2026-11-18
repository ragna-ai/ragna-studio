<script setup lang="ts">
import SocialPostStatusBadge from '~/features/social/components/SocialPostStatusBadge.vue';
import type { SocialPost } from '~/features/social/composables/useSocialPostApi';

interface Props {
  posts: SocialPost[];
  isLoading: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: 'delete-post', postId: string): void;
}>();

const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

function postPath(post: SocialPost): string {
  return `/social/${post.id}`;
}
</script>

<template>
  <ListTable>
    <TableHeader>
      <TableRow class="hover:bg-transparent">
        <TableHead>{{ t('social.list.table.content') }}</TableHead>
        <TableHead class="w-32">{{ t('common.status') }}</TableHead>
        <TableHead class="w-45">{{ t('common.created') }}</TableHead>
        <TableHead class="w-10">
          <span class="sr-only">{{ t('common.actions') }}</span>
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <ListSkeletonRows
        v-if="isLoading"
        :columns="['title', 'bar', 'bar', 'none']"
        tall
      />
      <template v-else>
        <TableRow
          v-for="post in posts"
          :key="post.id"
          class="h-14 cursor-pointer"
          @click="navigateTo(postPath(post))"
        >
          <TableCell>
            <ListTitleCell
              :title="post.content || t('social.list.emptyContent')"
              :to="postPath(post)"
            >
              <template #lead>
                <Icon name="hugeicons:share-08" class="size-4 text-icon" />
              </template>
            </ListTitleCell>
          </TableCell>
          <TableCell>
            <SocialPostStatusBadge :status="post.status" />
          </TableCell>
          <TableCell class="text-small text-muted-foreground">
            {{ formatDateTime(post.createdAt) }}
          </TableCell>
          <TableCell>
            <ListRowActions>
              <DropdownMenuItem as-child>
                <NuxtLinkLocale :to="postPath(post)">
                  <Icon name="hugeicons:pencil-edit-02" />
                  {{ t('common.edit') }}
                </NuxtLinkLocale>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="emit('delete-post', post.id)"
              >
                <Icon name="hugeicons:delete-02" />
                {{ t('common.delete') }}
              </DropdownMenuItem>
            </ListRowActions>
          </TableCell>
        </TableRow>
      </template>
    </TableBody>
  </ListTable>
</template>
