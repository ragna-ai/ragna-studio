import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import { requireMcpEnabled } from '../middlewares/requireMcpEnabled';
import {
  createMcpConnectionForUser,
  deleteMcpConnectionForUser,
  getMcpSettingsForUser,
  listMcpConnectionsForUser,
  updateMcpSettingsForUser,
} from '../services/mcp-settings.service';
import {
  validCreateMcpConnectionBody,
  validMcpConnectionIdParam,
  validMcpSettingsBody,
} from '../validation';

export const mcpSettingsController = new Hono()
  .basePath('/mcp-settings')
  .use(requireMcpEnabled)
  .use(authMiddleware)
  /**
   * [GET] /mcp-settings
   * The authenticated user's MCP master toggle, per-integration access, and
   * the connector URL to paste into Claude Desktop.
   */
  .get('/', async (c) => {
    const user = c.get('user');
    const settings = await getMcpSettingsForUser({ userId: user.id });
    return c.json(settings);
  })
  /**
   * [PUT] /mcp-settings
   * Replace the master toggle and per-integration access. Disabling revokes
   * every connection (P3).
   */
  .put('/', validMcpSettingsBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const settings = await updateMcpSettingsForUser({
      userId: user.id,
      enabled: body.enabled,
      access: body.access,
    });
    return c.json(settings);
  })
  /**
   * [GET] /mcp-settings/connections
   * Every connected app for this user: client, workspace, and usage.
   */
  .get('/connections', async (c) => {
    const user = c.get('user');
    const result = await listMcpConnectionsForUser({ userId: user.id });
    return c.json(result);
  })
  /**
   * [POST] /mcp-settings/connections
   * Creates or replaces the connection for a (user, client) pair (P9),
   * binding it to one of the user's workspaces. Called from the consent
   * page on approve.
   */
  .post('/connections', validCreateMcpConnectionBody, async (c) => {
    const user = c.get('user');
    const body = c.req.valid('json');
    const connection = await createMcpConnectionForUser({
      userId: user.id,
      clientId: body.clientId,
      workspaceId: body.workspaceId,
    });
    return c.json({ connection }, StatusCodes.CREATED);
  })
  /**
   * [DELETE] /mcp-settings/connections/:connectionId
   * Revokes a connection and the client's refresh tokens/consent.
   */
  .delete('/connections/:connectionId', validMcpConnectionIdParam, async (c) => {
    const user = c.get('user');
    const param = c.req.valid('param');
    await deleteMcpConnectionForUser({ userId: user.id, connectionId: param.connectionId });
    return c.body(null, StatusCodes.NO_CONTENT);
  });
