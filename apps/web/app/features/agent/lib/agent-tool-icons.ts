import type { AgentToolId } from '@repo/ai/client';
import {
  AppWindowIcon,
  CloudIcon,
  DatabaseIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  ListTodoIcon,
  NotebookPenIcon,
  RepeatIcon,
  Share2Icon,
  VideoIcon,
  type LucideIcon,
} from '@lucide/vue';

export interface AgentToolVisual {
  icon: LucideIcon;
  colorClass: string;
}

/** Icon and icon color per agent tool id, shared by the agent settings and the chat input. */
export const AGENT_TOOL_VISUALS = {
  think: { icon: RepeatIcon, colorClass: 'text-violet-600' },
  memory: { icon: NotebookPenIcon, colorClass: 'text-pink-600' },
  webSearch: { icon: GlobeIcon, colorClass: 'text-sky-600' },
  webBrowser: { icon: AppWindowIcon, colorClass: 'text-blue-600' },
  imageGen: { icon: ImageIcon, colorClass: 'text-fuchsia-600' },
  videoGen: { icon: VideoIcon, colorClass: 'text-rose-600' },
  linkedinDraft: { icon: Share2Icon, colorClass: 'text-cyan-600' },
  documents: { icon: FileTextIcon, colorClass: 'text-amber-600' },
  tasks: { icon: ListTodoIcon, colorClass: 'text-orange-600' },
  datasets: { icon: DatabaseIcon, colorClass: 'text-emerald-600' },
  'google-drive': { icon: CloudIcon, colorClass: 'text-teal-600' },
} as const satisfies Record<AgentToolId, AgentToolVisual>;

const visualsById: Record<string, AgentToolVisual> = AGENT_TOOL_VISUALS;

export function getAgentToolVisual(
  toolId: string,
): AgentToolVisual | undefined {
  return visualsById[toolId];
}
