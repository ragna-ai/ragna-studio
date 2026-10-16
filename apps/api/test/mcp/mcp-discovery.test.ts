import { describe, expect, test } from 'bun:test';
import { StatusCodes } from 'http-status-codes';
import * as z from 'zod';
import { app } from '../../src/app';

// MCP clients discover the authorization server from the root
// /.well-known paths (RFC 9728, RFC 8414), not from under /auth.

const protectedResourceMetadataSchema = z.strictObject({
  resource: z.string(),
  authorization_servers: z.array(z.string()),
  bearer_methods_supported: z.array(z.literal('header')),
  dpop_signing_alg_values_supported: z.array(z.string()),
  scopes_supported: z.array(z.string()),
});

// No registration_endpoint: dynamic client registration stays off, clients
// identify through a client ID metadata document instead.
const authorizationServerMetadataSchema = z.strictObject({
  client_id_metadata_document_supported: z.literal(true),
  scopes_supported: z.array(z.string()),
  issuer: z.string(),
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  jwks_uri: z.string(),
  introspection_endpoint: z.string(),
  revocation_endpoint: z.string(),
  response_types_supported: z.array(z.string()),
  response_modes_supported: z.array(z.string()),
  grant_types_supported: z.array(z.string()),
  token_endpoint_auth_methods_supported: z.array(z.string()),
  token_endpoint_auth_signing_alg_values_supported: z.array(z.string()),
  introspection_endpoint_auth_methods_supported: z.array(z.string()),
  introspection_endpoint_auth_signing_alg_values_supported: z.array(z.string()),
  revocation_endpoint_auth_methods_supported: z.array(z.string()),
  revocation_endpoint_auth_signing_alg_values_supported: z.array(z.string()),
  code_challenge_methods_supported: z.array(z.literal('S256')),
  authorization_response_iss_parameter_supported: z.boolean(),
  dpop_signing_alg_values_supported: z.array(z.string()),
  backchannel_logout_supported: z.boolean(),
  backchannel_logout_session_supported: z.boolean(),
});

describe('GET /.well-known: MCP OAuth discovery', () => {
  test('serves the protected resource metadata for /mcp', async () => {
    const response = await app.request('/.well-known/oauth-protected-resource/mcp');

    expect(response.status).toBe(StatusCodes.OK);
    const body = protectedResourceMetadataSchema.parse(await response.json());
    expect(body.resource).toEndWith('/mcp');
    expect(body.scopes_supported).toEqual(['mcp']);
  });

  test('serves the authorization server metadata for the advertised issuer', async () => {
    const resourceResponse = await app.request('/.well-known/oauth-protected-resource/mcp');
    const { authorization_servers } = protectedResourceMetadataSchema.parse(
      await resourceResponse.json(),
    );
    const issuerPath = new URL(authorization_servers[0] ?? '').pathname;

    const response = await app.request(`/.well-known/oauth-authorization-server${issuerPath}`);

    expect(response.status).toBe(StatusCodes.OK);
    const body = authorizationServerMetadataSchema.parse(await response.json());
    expect(body.issuer).toBe(authorization_servers[0] ?? '');
  });
});
