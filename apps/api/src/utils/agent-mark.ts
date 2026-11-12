import type { AgentMarkMedia } from '@repo/database';
import { toPublicMediaUrl } from '@repo/storage';

/** The mark fields every payload that names an agent carries. Null means "not set". */
export interface AgentMarkResponse {
  icon: string | null;
  tone: string | null;
  imageUrl: string | null;
}

interface AgentMarkSource extends AgentMarkMedia {
  icon: string | null;
  tone: string | null;
}

export function toAgentMarkResponse({
  icon,
  tone,
  imageMedia,
}: AgentMarkSource): AgentMarkResponse {
  return {
    icon,
    tone,
    imageUrl: imageMedia ? toPublicMediaUrl(imageMedia.storageKey) : null,
  };
}
