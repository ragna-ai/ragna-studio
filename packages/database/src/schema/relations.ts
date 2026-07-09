import { defineRelations } from 'drizzle-orm';
import { account } from './account.schema';
import { aiModel } from './aimodel.schema';
import { assistant } from './assistant.schema';
import { chat, chatMessage } from './chat.schema';
import { session } from './session.schema';
import { user } from './user.schema';
import { verification } from './verification.schema';

const schema = {
  user,
  account,
  session,
  verification,
  aiModel,
  assistant,
  chat,
  chatMessage,
};

export const relations = defineRelations(schema, (r) => ({
  user: {
    accounts: r.many.account(),
    sessions: r.many.session(),
    assistants: r.many.assistant(),
    chats: r.many.chat(),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  aiModel: {
    assistants: r.many.assistant(),
  },
  assistant: {
    user: r.one.user({
      from: r.assistant.userId,
      to: r.user.id,
    }),
    aiModel: r.one.aiModel({
      from: r.assistant.aiModelId,
      to: r.aiModel.id,
    }),
    chats: r.many.chat(),
  },
  chat: {
    user: r.one.user({
      from: r.chat.userId,
      to: r.user.id,
    }),
    assistant: r.one.assistant({
      from: r.chat.assistantId,
      to: r.assistant.id,
    }),
    messages: r.many.chatMessage(),
  },
  chatMessage: {
    chat: r.one.chat({
      from: r.chatMessage.chatId,
      to: r.chat.id,
    }),
  },
}));
