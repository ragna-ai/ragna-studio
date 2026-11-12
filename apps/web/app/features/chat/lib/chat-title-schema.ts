import { z } from 'zod';

export function createChatTitleSchema(requiredMessage: string) {
  return z.object({
    title: z.string().trim().min(1, { message: requiredMessage }),
  });
}
