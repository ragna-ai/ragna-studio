import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  getLanguageModel,
  smoothStream,
  streamText,
  toUIMessageStream,
} from '@repo/ai';
import { logger } from '@repo/logger';
import { Hono } from 'hono';
import { NotFoundException } from '../exceptions';
import { authMiddleware } from '../middlewares/authMiddleware';

export const chatController = new Hono()
  .basePath('/chat')
  .use(authMiddleware)
  /**
   * [GET] /chat
   * Get all chats for the authenticated user
   */
  .get('/', (c) => {
    const user = c.get('user');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return c.json({ user });
  })
  /**
   * [POST] /chat/test
   * Test endpoint for chat functionality
   */
  .post('/test', async (c) => {
    const user = c.get('user');
    const { messages } = await c.req.json();

    const languageModel = getLanguageModel({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
    });

    const result = streamText({
      model: languageModel,
      instructions: 'You are a helpful assistant.',
      messages: await convertToModelMessages(messages),
      temperature: 0.8,
      maxOutputTokens: 500,
      experimental_transform: smoothStream({
        delayInMs: 20,
        chunking: 'word',
      }),
      onStart({ callId, modelId, runtimeContext }) {
        logger.debug('Request started', {
          callId,
          modelId,
          runtimeContext,
        });
      },
      onEnd({ callId, usage, finishReason }) {
        logger.debug('Request finished', {
          callId,
          finishReason,
          usage,
        });
      },
      onError(error) {
        logger.error('Error in chat stream', error);
      },
    });

    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  });
