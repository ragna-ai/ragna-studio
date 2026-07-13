<script setup lang="ts">
import {
  MessageSquareIcon,
  SettingsIcon,
  StarIcon,
  Trash2Icon,
} from '@lucide/vue';
import type { Agent } from '~/features/agent/types';
import { useCreateChat } from '~/features/chat/composables/useChatApi';

// Imports

interface Props {
  agents: Agent[];
  favorites?: any[];
  meta?: any;
}

// Props
const props = defineProps<Props>();
// Emits
// Refs

// Composables
const router = useRouter();
const { mutateAsync: createNewChat } = useCreateChat();

// Computed

// Functions

// Emits
const emit = defineEmits<{
  (e: 'delete-agent', agentId: string): void;
}>();

// Refs

// Composables

// Computed
// Functions

const handleNewChat = async (agentId: string) => {
  const response = await createNewChat({ agentId });
  const newChatId = response?.chat?.id;
  if (!newChatId) {
    throw createError({ status: 500, statusMessage: 'Failed to create chat' });
  }
  router.push(`/chat/${newChatId}`);
};

const handleAddFavorite = (agentId: string) => {
  // Logic to handle adding the agent to favorites
};

const handleDeleteFavorite = (agentId: string) => {
  // Logic to handle deleting the agent from favorites
};

// Hooks
</script>

<template>
  <div v-if="agents && agents.length > 0">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{{ $t('table.favorit') }}</TableHead>
          <TableHead>{{ $t('table.avatar') }}</TableHead>
          <TableHead>{{ $t('table.name') }}</TableHead>
          <TableHead class="whitespace-nowrap">
            {{ $t('table.ai_model') }}
          </TableHead>
          <TableHead class="text-right">{{ $t('table.actions') }}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow
          v-for="agent in agents || []"
          :key="agent.id"
          class="cursor-pointer"
          @click="navigateTo(`/agent/${agent.id}`)"
        >
          <TableCell class="w-12">
            <div class="border-0">
              <Button
                v-if="favorites?.some((f: any) => f.favoriteId === agent.id)"
                variant="ghost"
                size="icon"
                @click="() => handleDeleteFavorite(agent.id)"
              >
                <StarIcon
                  class="size-6! fill-blue-500 stroke-none stroke-1.5"
                />
              </Button>
              <Button
                v-else
                variant="ghost"
                size="icon"
                @click="() => handleAddFavorite(agent.id)"
              >
                <StarIcon class="size-5! stroke-stone-400 stroke-1.5" />
              </Button>
            </div>
          </TableCell>
          <TableCell>
            <div class="size-8 rounded-full bg-slate-200"></div>
          </TableCell>
          <TableCell class="">
            <div class="text-sm font-semibold">
              {{ agent.name }}
            </div>
          </TableCell>
          <TableCell class="whitespace-nowrap">
            <div class="flex items-center space-x-2">
              <span :name="agent.aiModel.provider" class="size-4 stroke-1.5" />
              <span>{{ agent.aiModel.displayName }}</span>
            </div>
          </TableCell>
          <TableCell
            class="flex justify-end space-x-2 text-right whitespace-nowrap"
          >
            <Button variant="outline" @click="() => handleNewChat(agent.id)">
              Chat
              <MessageSquareIcon
                class="ml-2 size-4 shrink-0 stroke-1.5 text-primary"
              />
            </Button>
            <Button as-child variant="outline" size="icon">
              <NuxtLinkLocale
                :to="`/agent/${agent.id}`"
                variant="outline"
                size="icon"
              >
                <SettingsIcon class="size-4 stroke-1.5 text-primary" />
              </NuxtLinkLocale>
            </Button>

            <Button
              variant="outline"
              size="icon"
              @click="() => emit('delete-agent', agent.id)"
            >
              <Trash2Icon class="size-4 stroke-1.5 text-destructive" />
            </Button>
          </TableCell>
        </TableRow>
      </TableBody>
      <!-- Meta Caption -->
      <TableMetaCaption :itemsLength="agents.length" :meta="meta" />
    </Table>
  </div>
</template>
