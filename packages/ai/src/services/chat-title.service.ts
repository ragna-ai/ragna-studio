import { config } from '@repo/config';
import { logger } from '@repo/logger';
import { tryCatch } from '@repo/utils';
import { generateText } from 'ai';
import { getLanguageModel } from '../factories';
import type { UIMessage } from '../types';
import { withDefaultProviderOptions } from './agent.service';

const chatTitleGeneratorPrompt = `As a chat title generator your task is to create a short chat title based on the provided text.\n
  Rules:\n
  - Always respond with the title in plain text in the users language\n
  - The title must be short, concise, descriptive, and relevant to the content of the message\n
  - Do not use any special characters, markdown, or punctuation marks`;

// Same default a chat is created with (see createChatForWorkspace in
// apps/api's chat.service.ts), so a chat that never manages to get a
// generated title still reads sensibly.
const FALLBACK_CHAT_TITLE = 'Chat';

// Models sometimes ignore the "no markdown" instruction (e.g. "# Title") or
// wrap the title in quotes/bold markers. Strip that formatting rather than
// relying on the prompt alone.
function sanitizeChatTitle(rawTitle: string): string {
  return rawTitle
    .trim()
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[*_`~"']+|[*_`~"']+$/g, '')
    .trim();
}

class EmptyChatTitleError extends Error {
  constructor(rawTitle: string) {
    super(`Generated chat title was empty after sanitization (raw: ${JSON.stringify(rawTitle)})`);
    this.name = 'EmptyChatTitleError';
  }
}

async function generateChatTitleOnce(messageText: string): Promise<string> {
  const { text } = await generateText({
    model: getLanguageModel({
      provider: config.chatTitleModelProvider,
      model: config.chatTitleModel,
    }),
    instructions: chatTitleGeneratorPrompt,
    messages: [{ role: 'user', content: messageText }],
    providerOptions: withDefaultProviderOptions(),
    // 'none' matters as much as the token budget: on a reasoning-capable
    // model, the AI SDK's unified `reasoning` option otherwise defaults to
    // 'provider-default', which spends part of maxOutputTokens on hidden
    // reasoning tokens before any visible text, deterministically starving
    // a budget this small and yielding an empty `text` on every retry.
    reasoning: 'none',
    // Generous relative to a short title: multi-byte languages (e.g. CJK)
    // and a markdown-wrapped response both cost more tokens per visible
    // character than English does.
    maxOutputTokens: 60,
  });

  logger.debug(`Raw generated chat title: ${text}`);

  const title = sanitizeChatTitle(text);

  if (title.length === 0) {
    throw new EmptyChatTitleError(text);
  }

  return title;
}

export async function generateChatTitle({ uiMessage }: { uiMessage: UIMessage }): Promise<string> {
  const messageText = uiMessage.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();

  const { data: title, error } = await tryCatch(() => generateChatTitleOnce(messageText), {
    options: {
      retries: 3,
      shouldRetry: (error) => error instanceof EmptyChatTitleError,
    },
  });

  if (error !== null || !title) {
    logger.error('Error generating chat title, using fallback title', error);
    return FALLBACK_CHAT_TITLE;
  }

  logger.debug(`Generated chat title: ${title}`);

  return title;
}
