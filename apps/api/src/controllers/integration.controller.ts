import { Hono } from 'hono';
import { StatusCodes } from 'http-status-codes';
import { authMiddleware } from '../middlewares/authMiddleware';
import {
  completeIntegrationConnect,
  listConnectableIntegrations,
  listConnectionsForUser,
  removeConnectionForUser,
  startIntegrationConnect,
} from '../services/integration.service';
import {
  validConnectIntegrationBody,
  validIntegrationConnectionIdParam,
  validOauthCallbackQuery,
} from '../validation';

export const integrationController = new Hono()
  .basePath('/integration')
  .use(authMiddleware)
  /**
   * [GET] /integration/catalog
   */
  .get('/catalog', (c) => c.json({ integrations: listConnectableIntegrations() }))
  /**
   * [GET] /integration/connection
   */
  .get('/connection', async (c) => {
    const user = c.get('user');
    const connections = await listConnectionsForUser({ userId: user.id });
    return c.json({ connections });
  })
  /**
   * [POST] /integration/connect
   */
  .post('/connect', validConnectIntegrationBody, async (c) => {
    const user = c.get('user');
    const { integrationId, returnPath } = c.req.valid('json');
    const url = await startIntegrationConnect({ userId: user.id, integrationId, returnPath });
    return c.json({ url });
  })
  /**
   * [GET] /integration/oauth/callback
   * The provider's redirect target. Always answers with a redirect back into the app.
   */
  .get('/oauth/callback', validOauthCallbackQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');
    const location = await completeIntegrationConnect({
      userId: user.id,
      userEmail: user.email,
      state: query.state,
      code: query.code,
      providerError: query.error,
    });
    return c.redirect(location, StatusCodes.MOVED_TEMPORARILY);
  })
  /**
   * [DELETE] /integration/connection/:connectionId
   */
  .delete('/connection/:connectionId', validIntegrationConnectionIdParam, async (c) => {
    const user = c.get('user');
    const { connectionId } = c.req.valid('param');
    await removeConnectionForUser({ userId: user.id, connectionId });
    return c.json({ message: 'Connection removed successfully' });
  });
