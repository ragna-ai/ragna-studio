import * as z from 'zod';

export const providerIdSchema = z.enum(['google', 'microsoft', 'linkedin']);
export const integrationIdSchema = z.enum(['gmail', 'outlook-mail', 'linkedin-posting']);
export const integrationCategorySchema = z.enum(['mail', 'calendar', 'files', 'social']);
export const connectionStatusSchema = z.enum(['active', 'needs_reauth']);

export const integrationDefinitionSchema = z.object({
  id: integrationIdSchema,
  provider: providerIdSchema,
  category: integrationCategorySchema,
  authType: z.literal('oauth2'),
  /** Provider scopes this integration needs, on top of the identity scopes the provider adds. */
  scopes: z.array(z.string()),
});

export const catalogEntrySchema = integrationDefinitionSchema.pick({
  id: true,
  provider: true,
  category: true,
  authType: true,
});

/** What the API returns for a connection. It has no token fields by construction. */
export const integrationConnectionDtoSchema = z.object({
  id: z.string(),
  provider: providerIdSchema,
  externalEmail: z.string().nullable(),
  displayName: z.string().nullable(),
  scopes: z.array(z.string()),
  integrations: z.array(integrationIdSchema),
  status: connectionStatusSchema,
  createdAt: z.string(),
});

export const integrationCatalogResponseSchema = z.object({
  integrations: z.array(catalogEntrySchema),
});

export const integrationConnectionsResponseSchema = z.object({
  connections: z.array(integrationConnectionDtoSchema),
});

export const connectIntegrationBodySchema = z.object({
  integrationId: integrationIdSchema,
  returnPath: z.string().max(500),
});

export const connectIntegrationResponseSchema = z.object({ url: z.url({ protocol: /^https$/ }) });

export type ProviderId = z.infer<typeof providerIdSchema>;
export type IntegrationId = z.infer<typeof integrationIdSchema>;
export type IntegrationCategory = z.infer<typeof integrationCategorySchema>;
export type IntegrationConnectionStatus = z.infer<typeof connectionStatusSchema>;
export type IntegrationDefinition = z.infer<typeof integrationDefinitionSchema>;
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;
export type IntegrationConnectionDto = z.infer<typeof integrationConnectionDtoSchema>;
export type IntegrationCatalogResponse = z.infer<typeof integrationCatalogResponseSchema>;
export type IntegrationConnectionsResponse = z.infer<typeof integrationConnectionsResponseSchema>;
export type ConnectIntegrationBody = z.infer<typeof connectIntegrationBodySchema>;
export type ConnectIntegrationResponse = z.infer<typeof connectIntegrationResponseSchema>;
