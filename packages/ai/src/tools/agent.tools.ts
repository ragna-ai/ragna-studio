import type { UIMessageStreamWriter } from 'ai';
import { getGeneratedImages } from './image-gen.tool';
import { getLinkedinDraft } from './linkedin-draft.tool';
import { getMemoryTool } from './memory.tool';
import { getThoughts } from './think.tool';
import { getWebBrowserResults } from './web-browser.tool';
import { getWebSearchResults } from './web-search.tool';

export type AgentTools = {
  think: ReturnType<typeof getThoughts>;
  webSearch: ReturnType<typeof getWebSearchResults>;
  webBrowser: ReturnType<typeof getWebBrowserResults>;
  imageGen: ReturnType<typeof getGeneratedImages>;
  linkedinDraft: ReturnType<typeof getLinkedinDraft>;
  memory: ReturnType<typeof getMemoryTool>;
};

export type AgentToolContext = {
  userId: string;
  agentId: string;
  workspaceId: string | null;
};

/*
  // need to type like this to avoid circular type dependencies
  // typing here is not necessary, but provides type safety for `writer.write()`
  // e.g. completion for `data-tool` and type safe `data` object
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
*/

export const tools = (writer: UIMessageStreamWriter, ctx: AgentToolContext): AgentTools => ({
  think: getThoughts(writer),
  webSearch: getWebSearchResults(writer),
  webBrowser: getWebBrowserResults(writer),
  imageGen: getGeneratedImages(writer, ctx.userId, ctx.workspaceId),
  linkedinDraft: getLinkedinDraft(writer, ctx.userId, ctx.workspaceId),
  memory: getMemoryTool(writer, ctx.agentId),
  // knowledge: getKnowledgeData(writer),
  // createDocument: () => {
  //   /* ... */
  // },
  // editDocument: () => {
  //   /* ... */
  // },
});
