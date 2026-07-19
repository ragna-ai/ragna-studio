<script setup lang="ts">
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { useChat } from '@ai-sdk/vue';
import {
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIDataTypes,
  type UIMessage,
  type UIMessagePart,
  type UITools,
} from 'ai';
import { storeToRefs } from 'pinia';
import ChatMessage from '~/features/chat/components/ChatMessage.vue';
import { useCreateChat } from '~/features/chat/composables/useChatApi';
import { WebSocketChatTransport } from '~/features/chat/lib/WebSocketChatTransport';
import { useWorkspaceScopeStore } from '~/features/workspace/stores/workspacescope.store';
import { createPrimaryId } from '~/lib/utils';

// Props
interface Props {
  chatId?: string;
  initialMessages?: UIMessage[];
}

const props = defineProps<Props>();

// Emits

// Refs
const chatId = ref(props.chatId ?? null);

// Composables
// A workspace is always active (docs/api-standards/prd.md): activeWorkspaceId
// is only briefly '' on first load, before the workspace list resolves it.
const { activeWorkspaceId } = storeToRefs(useWorkspaceScopeStore());
const { mutateAsync: createNewChat } = useCreateChat(activeWorkspaceId);

// Computed
const initialMessages = props.initialMessages
  ? structuredClone(toRaw(props.initialMessages))
  : undefined;

const { messages, sendMessage, status, error } = useChat({
  messages: initialMessages,
  generateId: createPrimaryId,
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  transport: new WebSocketChatTransport(() => chatId.value),
});

const isBusy = computed(
  () => status.value === 'submitted' || status.value === 'streaming',
);

// The server opens the stream before the first token arrives, so the status
// flips to 'streaming' while there is still nothing to show. Keep the shimmer
// until the assistant reply renders something (text, reasoning, or a tool call).
const isVisiblePart = (part: UIMessagePart<UIDataTypes, UITools>) => {
  if (part.type === 'text' || part.type === 'reasoning') {
    return part.text.length > 0;
  }
  return isToolUIPart(part);
};

const hasVisibleReply = computed(() => {
  const last = messages.value.at(-1);
  if (last?.role !== 'assistant') return false;
  return last.parts.some(isVisiblePart);
});

// Functions
async function handleSubmit(message: { text: string }) {
  const text = message.text.trim();
  if (!text) {
    return;
  }

  if (!chatId.value) {
    try {
      const { chat } = await createNewChat({ agentId: undefined });
      if (!chat) throw createError({ statusMessage: 'Failed to create chat' });
      chatId.value = chat.id;
    } catch {
      return;
    }
  }

  sendMessage({ text });
}

// Hooks
</script>

<template>
  <div class="flex h-full w-full flex-col p-4">
    <MessageScrollerProvider auto-scroll default-scroll-position="last-anchor">
      <MessageScroller>
        <MessageScrollerViewport>
          <MessageScrollerContent
            :aria-busy="isBusy"
            class="mx-auto max-w-3xl pb-8"
          >
            <MessageScrollerItem
              v-for="message in messages"
              :key="message.id"
              :message-id="message.id"
              :scroll-anchor="message.role === 'user'"
            >
              <!-- Message -->
              <ChatMessage :key="message.id" :message="message" />
              <!-- end chat message -->
            </MessageScrollerItem>
            <!-- Thinking -->
            <Shimmer v-if="isBusy && !hasVisibleReply" class="text-sm">
              Thinking...
            </Shimmer>
            <p v-if="error" class="text-sm text-destructive">
              {{ error.message }}
            </p>
            <!-- -->
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton direction="end" />
      </MessageScroller>
    </MessageScrollerProvider>

    <!-- input -->
    <div class="mx-auto w-full max-w-4xl">
      <PromptInput multiple global-drop @submit="handleSubmit">
        <PromptInputBody>
          <PromptInputTextarea class="" autofocus />
        </PromptInputBody>
        <PromptInputFooter @click="() => console.log('footer clicked')">
          <PromptInputSubmit
            class="ml-auto"
            :status="status"
            :disabled="isBusy"
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  </div>
</template>
