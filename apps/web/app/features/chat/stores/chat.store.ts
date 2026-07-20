import type { ChatAgent } from '~/features/chat/types';

export const useChatStore = defineStore('chat', () => {
  const id = ref<string | undefined>(undefined);
  const title = ref<string | undefined>(undefined);
  const agent = ref<ChatAgent | undefined>(undefined);

  const setChat = (chat?: { id?: string; title?: string; agent?: ChatAgent }) => {
    id.value = chat?.id;
    title.value = chat?.title;
    agent.value = chat?.agent;
  };

  return {
    id,
    title,
    agent,
    setChat,
  };
});
