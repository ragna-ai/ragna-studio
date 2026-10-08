import type { CreditSpendState } from '@repo/database';
import { createMiddleware } from 'hono/factory';
import { assertCanSpend } from '../services/credit.service';
import type { WorkspaceGuardEnv } from './workspaceGuard';

export type CreditGuardEnv = WorkspaceGuardEnv & {
  Variables: WorkspaceGuardEnv['Variables'] & {
    creditSpendState: CreditSpendState | null;
  };
};

/**
 * Gates a single spending route behind `assertCanSpend`
 * (specs/credits/prd.md, "creditGuard"). Reads the workspace from
 * `c.get('workspace')` rather than the route param, so it needs no
 * validation and no query of its own beyond the gate. It therefore **must**
 * be mounted after `workspaceGuard`.
 *
 * Mounted per route, never with `.use()` on a whole controller: only a
 * minority of workspace-scoped routes spend anything, and a guard that fires
 * on every `GET` in order to serve one `POST` is the mistake this design
 * avoids. V1 has exactly one such route: `POST /:workflowId/run`
 * (`workflow.controller.ts`).
 *
 * Usage:
 *
 * ```ts
 * .post('/:workflowId/run', creditGuard, validWorkflowIdParam, async (c) => {
 *   // ...
 * })
 * ```
 *
 * Stashes the result as `creditSpendState` so a handler that already needs
 * the balance (e.g. to cap how much work to allow) doesn't have to query it
 * twice. V1 handlers ignore it.
 */
export const creditGuard = createMiddleware<CreditGuardEnv>(async (c, next) => {
  const workspace = c.get('workspace');
  c.set('creditSpendState', await assertCanSpend({ workspaceId: workspace.id }));
  await next();
});
