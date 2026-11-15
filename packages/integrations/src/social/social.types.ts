import type { IntegrationConnection } from '@repo/database';
import type { LinkedinPublisher } from './linkedin/linkedin.publisher';

export type ResolvedLinkedinPublisher =
  | { status: 'not_connected' }
  | { status: 'needs_reauth'; connectionId: string }
  | { status: 'ready'; publisher: LinkedinPublisher; connection: IntegrationConnection };
