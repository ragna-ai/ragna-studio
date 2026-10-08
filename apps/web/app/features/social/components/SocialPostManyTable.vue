<script setup lang="ts">
import {
  MoreVerticalIcon,
  PencilIcon,
  Share2Icon,
  Trash2Icon,
} from '@lucide/vue';
import SocialPostStatusBadge from '~/features/social/components/SocialPostStatusBadge.vue';
import type { SocialPost } from '~/features/social/composables/useSocialPostApi';

// Imports

interface Props {
  posts: SocialPost[];
  meta?: { totalCount: number };
}

// Props
defineProps<Props>();

// Emits
const emit = defineEmits<{
  (e: 'delete-post', postId: string): void;
}>();

// Refs

// Composables
const { t } = useI18n();
const { formatDateTime } = useDateTimeFormat();

// Computed

// Functions

// Hooks
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>&nbsp;</TableHead>
        <TableHead>{{ t('common.status') }}</TableHead>
        <TableHead>{{ t('social.list.table.content') }}</TableHead>
        <TableHead>{{ t('common.created') }}</TableHead>
        <TableHead class="text-right">
          {{ t('common.actions') }}
        </TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableEmpty v-if="posts.length === 0" :colspan="4">
        {{ t('social.empty') }}
      </TableEmpty>
      <TableRow
        v-for="post in posts"
        :key="post.id"
        class="cursor-pointer"
        @click="navigateTo(`/social/${post.id}`)"
      >
        <TableCell class="w-12">
          <Share2Icon class="size-4 stroke-1.5" />
        </TableCell>
        <TableCell class="w-32">
          <SocialPostStatusBadge :status="post.status" />
        </TableCell>
        <TableCell class="max-w-md truncate text-sm text-muted-foreground">
          {{ post.content || t('social.list.emptyContent') }}
        </TableCell>
        <TableCell class="whitespace-nowrap">
          {{ formatDateTime(post.createdAt) }}
        </TableCell>
        <!-- Actions -->
        <TableCell class="text-right whitespace-nowrap" @click.stop>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                variant="outline"
                size="icon"
                :aria-label="t('common.actions')"
              >
                <MoreVerticalIcon class="size-4 stroke-1.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem as-child>
                <NuxtLinkLocale :to="`/social/${post.id}`">
                  <PencilIcon class="size-4 stroke-1.5" />
                  {{ t('common.edit') }}
                </NuxtLinkLocale>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                @click="() => emit('delete-post', post.id)"
              >
                <Trash2Icon class="size-4 stroke-1.5" />
                {{ t('common.delete') }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    </TableBody>
    <TableMetaCaption :itemsLength="posts.length" :meta="meta" />
  </Table>
</template>
