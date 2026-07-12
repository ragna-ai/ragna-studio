import { defineRelations } from 'drizzle-orm';
import { account } from './account.schema';
import { agent, agentTemplate } from './agent.schema';
import { aiModel } from './aimodel.schema';
import { chat, chatMessage } from './chat.schema';
import { genImage } from './genimage.schema';
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
  agentTemplate,
  chat,
  chatMessage,
  genImage,
};

export const relations = defineRelations(schema, (r) => ({
  user: {
    accounts: r.many.account(),
    sessions: r.many.session(),
    agents: r.many.agent(),
    chats: r.many.chat(),
    genImages: r.many.genImage(),
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
    agentTemplates: r.many.agentTemplate(),
  },
  agent: {
    user: r.one.user({
      from: r.agent.userId,
      to: r.user.id,
      optional: false,
    }),
    aiModel: r.one.aiModel({
      from: r.agent.aiModelId,
      to: r.aiModel.id,
      optional: false,
    }),
    chats: r.many.chat(),
  },
  agentTemplate: {
    aiModel: r.one.aiModel({
      from: r.agentTemplate.aiModelId,
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
  genImage: {
    user: r.one.user({
      from: r.genImage.userId,
      to: r.user.id,
      optional: false,
    }),
  },
}));
