import type { UIMessage } from '@repo/ai';
import { generateText, getLanguageModel } from '@repo/ai';
import { logger } from '@repo/logger';
import { InternalServerErrorException } from '../exceptions';

const chatTitleGeneratorPrompt = `As a chat title generator your task is to create a short chat title based on the provided text.\n
  You always only respond with the chat title in plain text in the users language.\n
  The title should be concise, descriptive, and relevant to the content of the message.\n
  Avoid using any special characters, markdown, or punctuation marks at the beginning or end of the title.\n
  Keep the title under 10 words if possible.`;

export async function generateChatTitle({ uiMessage }: { uiMessage: UIMessage }) {
  //
  const messageText = uiMessage.parts
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join(' ')
    .trim();

  try {
    const { text } = await generateText({
      model: getLanguageModel({
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
      }),
      instructions: chatTitleGeneratorPrompt,
      messages: [{ role: 'user', content: messageText }],
      maxOutputTokens: 20,
    });

    const title = text.trim().replace(/(^"|"$)/g, '');

    logger.debug(`Generated chat title: ${title}`);

    return title;
    //
  } catch (error) {
    logger.error('Error generating chat title', error);
    throw new InternalServerErrorException('Failed to generate chat title');
  }
}
