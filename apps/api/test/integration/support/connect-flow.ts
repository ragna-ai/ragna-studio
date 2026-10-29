import * as z from 'zod';
import { app } from '../../../src/app';

const connectResponseSchema = z.strictObject({ url: z.string() });

export interface StartedConnect {
  authorizeUrl: URL;
  state: string;
}

export async function startConnect({
  cookieHeader,
  integrationId,
  returnPath = '/settings/connections',
}: {
  cookieHeader: string;
  integrationId: string;
  returnPath?: string;
}): Promise<StartedConnect> {
  const response = await app.request('/integration/connect', {
    method: 'POST',
    headers: { cookie: cookieHeader, 'content-type': 'application/json' },
    body: JSON.stringify({ integrationId, returnPath }),
  });
  if (response.status !== 200) {
    throw new Error(`startConnect failed with status ${response.status}`);
  }

  const { url } = connectResponseSchema.parse(await response.json());
  const authorizeUrl = new URL(url);
  const state = authorizeUrl.searchParams.get('state');
  if (!state) {
    throw new Error('The authorize URL has no state');
  }

  return { authorizeUrl, state };
}

export async function callOauthCallback({
  cookieHeader,
  query,
}: {
  cookieHeader: string;
  query: Record<string, string>;
}): Promise<Response> {
  const search = new URLSearchParams(query).toString();

  return app.request(`/integration/oauth/callback?${search}`, {
    headers: { cookie: cookieHeader },
    redirect: 'manual',
  });
}

export const connectionSchema = z.strictObject({
  id: z.string(),
  provider: z.enum(['google', 'microsoft', 'linkedin']),
  externalEmail: z.string().nullable(),
  displayName: z.string().nullable(),
  scopes: z.array(z.string()),
  integrations: z.array(z.enum(['gmail', 'outlook-mail', 'linkedin-posting'])),
  status: z.enum(['active', 'needs_reauth']),
  createdAt: z.string(),
});

const listSchema = z.strictObject({ connections: z.array(connectionSchema) });

export async function listConnections(cookieHeader: string) {
  const response = await app.request('/integration/connection', {
    headers: { cookie: cookieHeader },
  });
  return listSchema.parse(await response.json()).connections;
}
