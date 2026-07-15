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

export type AgentToolDeps = {
  userId: string;
  agentId: string;
};

/*
  // need to type like this to avoid circular type dependencies
  // typing here is not necessary, but provides type safety for `writer.write()`
  // e.g. completion for `data-tool` and type safe `data` object
  writer: UIMessageStreamWriter<UIMessage<never, any>>,
*/

export const tools = (writer: UIMessageStreamWriter, deps: AgentToolDeps): AgentTools => ({
  think: getThoughts(writer),
  webSearch: getWebSearchResults(writer),
  webBrowser: getWebBrowserResults(writer),
  imageGen: getGeneratedImages(writer, deps.userId),
  linkedinDraft: getLinkedinDraft(writer, deps.userId),
  memory: getMemoryTool(writer, deps.agentId),
  // knowledge: getKnowledgeData(writer),
  // createDocument: () => {
  //   /* ... */
  // },
  // editDocument: () => {
  //   /* ... */
  // },
});
