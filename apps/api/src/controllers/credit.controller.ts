import { Hono } from 'hono';
import { authMiddleware } from '../middlewares/authMiddleware';
import { getCreditBalanceForUser, listCreditUsageForUser } from '../services/credit.service';
import { validPaginationQuery } from '../validation';

// Credits belong to the account, not to a workspace, so these are
// user-global routes (specs/credits/prd.md, "API"): `authMiddleware` only, no
// `workspaceGuard`.
export const creditController = new Hono()
  .basePath('/credit')
  .use(authMiddleware)
  /**
   * [GET] /credit/balance
   */
  .get('/balance', async (c) => {
    const user = c.get('user');

    const credit = await getCreditBalanceForUser({ userId: user.id });

    return c.json({ credit });
  })
  /**
   * [GET] /credit/usage
   * Paginated history of what the user's account has spent credits on.
   */
  .get('/usage', validPaginationQuery, async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');

    const { usages, totalCount } = await listCreditUsageForUser({
      userId: user.id,
      page: query.page,
      limit: query.limit,
      sort: query.sort,
    });

    return c.json({ usages, meta: { totalCount } });
  });
