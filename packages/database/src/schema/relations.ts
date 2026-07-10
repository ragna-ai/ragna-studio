import { defineRelations } from 'drizzle-orm';
import { account } from './account.schema';
import { agent, defaultAgent } from './agent.schema';
import { aiModel } from './aimodel.schema';
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
  agent,
  defaultAgent,
  chat,
  chatMessage,
};

export const relations = defineRelations(schema, (r) => ({
  user: {
    accounts: r.many.account(),
    sessions: r.many.session(),
    agents: r.many.agent(),
    chats: r.many.chat(),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
      optional: false,
    }),
  },
  aiModel: {
    agents: r.many.agent(),
    defaultAgents: r.many.defaultAgent(),
  },
  agent: {
    user: r.one.user({
      from: r.agent.userId,
      to: r.user.id,
    }),
    aiModel: r.one.aiModel({
      from: r.agent.aiModelId,
      to: r.aiModel.id,
      optional: false,
    }),
    chats: r.many.chat(),
  },
  defaultAgent: {
    aiModel: r.one.aiModel({
      from: r.defaultAgent.aiModelId,
      to: r.aiModel.id,
      optional: false,
    }),
  },
  chat: {
    user: r.one.user({
      from: r.chat.userId,
      to: r.user.id,
      optional: false,
    }),
    agent: r.one.agent({
      from: r.chat.agentId,
      to: r.agent.id,
      optional: false,
    }),
    messages: r.many.chatMessage(),
  },
  chatMessage: {
    chat: r.one.chat({
      from: r.chatMessage.chatId,
      to: r.chat.id,
      optional: false,
    }),
  },
}));
