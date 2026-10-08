# Credit System (PRD)

> **Status: implemented** (merged via PR #13, 2026-07-29). Reviewed the same
> day (`review-2026-07-29.md`); three flaws found and fixed in follow-up
> commits (`credit gate fails closed on unpriced models`, `strict
> CREDIT_MARKUP_BPS validation`). Inert in practice until pricing is seeded
> and `CREDITS_ENABLED` is turned on.

A token-exact credit system. Every LLM call is priced from the provider's
real per-token rates, multiplied by a configurable markup, and debited from
an append-only ledger. No floating-point arithmetic anywhere in the money
path.

V1 covers **text (token-priced) models only**: chat and workflow/team agent
runs. Image generation, video generation, tool-call pricing, and
system-initiated spend are v2.

## Decisions

Settled 2026-07-27. Do not re-open.

| Decision               | Choice                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Unit**               | 1 credit = $0.001 (1000 credits = $1). Ledger stores **micro-credits** as `bigint` (1 credit = 1,000,000 µC).                                                                                                                                                                                                                                                                   |
| **Prices**             | `integer` nanoUSD per token, on `ai_models.pricing` (jsonb). Every real price sheet is an exact integer at this scale.                                                                                                                                                                                                                                                          |
| **The identity**       | 1 µC ≡ 1 nanoUSD. Provider cost converts to credits with no conversion factor, which is the whole point of the anchor.                                                                                                                                                                                                                                                          |
| **Markup**             | `markupBps`, a multiplier in basis points. Global default in `@repo/config`, optional per-model override in `pricing`. `10_000` = cost price, `15_000` = 1.5x.                                                                                                                                                                                                                  |
| **Balance holder**     | A `credit_accounts` row. V1: one per user. Later: one per organisation. Ledger and usage rows reference `creditAccountId`, never `userId`.                                                                                                                                                                                                                                      |
| **Account resolution** | `workspaceId → workspace.ownerId → credit_accounts.userId`. The workspace is a **locator for the billing entity, not a billing scope**: accounts are never per-workspace. Resolved from the owner, never the acting user, because `workspace_users` (already anticipated at `workspace.schema.ts:9`) makes those diverge and billing the acting member would be silently wrong. |
| **Overdraft**          | Gate on `balance > 0` before a run, settle the true cost after, allow the balance to go negative. The next request is refused.                                                                                                                                                                                                                                                  |
| **Gate placement**     | One policy function (`assertCanSpend`), three entry points: `creditGuard` mounted **per spending route** (never on a whole controller, never folded into `workspaceGuard`), a direct call on the WS chat path, and a repo call in the worker.                                                                                                                                   |
| **Cached tokens**      | Charged as if uncached. The discount is platform margin. Real cost is recorded separately for margin analytics.                                                                                                                                                                                                                                                                 |
| **Grants**             | Manual only in v1 (admin-inserted ledger rows). No signup grant, no monthly refill.                                                                                                                                                                                                                                                                                             |

## Goals (v1)

- Every text LLM call made on a user's behalf in chat and workflows debits
  their credit account, priced exactly from the model's per-token rates.
- Cost is computed in integers end to end. Exactly one rounding step per
  charge, always up.
- A user with a zero or negative balance cannot start a new run.
- Every charge is auditable: the usage row records the token counts, the
  unit prices in effect, the markup applied, the raw provider cost, and the
  credits charged.
- Retries and reconnects cannot double-charge.
- The user sees their balance and a paginated list of what they spent it on.
- Credits are granted by hand (SQL or an admin script).

## Non-goals (v1)

Deferred to v2, listed so the schema does not paint us into a corner:

- **Image and video generation.** FLUX is per-image and varies by
  resolution; Veo is per-second. The `pricing` jsonb is already
  discriminated by `kind` so these slot in without a migration, but neither
  path emits a usage callback today.
- **Invisible spend.** `generateChatTitle` (Haiku, ~20 output tokens),
  dataset embeddings, and the web-search tool (priced per search, not per
  token). Current intent for v2 is **record but do not charge**. In v1 the
  platform absorbs these silently and no usage row is written.
- **Failed and aborted runs.** A run aborted mid-stream still consumed
  input tokens. V1 charges nothing for them, matching the existing
  `onEnd` early-return on `isAborted || finishReason === 'error'`.
- **Automatic grants.** Signup bonus, monthly refill, plans, purchase flow,
  payment provider. All v2.
- **Reservations.** No pre-authorised hold on the balance. See
  [Overdraft](#overdraft) for why.
- **Per-plan or per-workspace markup.** Global plus per-model only.

## The unit

The anchor is chosen so the ledger's smallest unit and the cost
calculation's smallest unit are the same integer:

- 1 credit = $0.001, so 1000 credits = $1
- 1 credit = 1,000,000 micro-credits (µC)
- therefore 1 µC = $0.000000001 = **1 nanoUSD**

Model prices are stored as nanoUSD per token, which makes provider cost and
credits the same number. There is no exchange rate, no scaling constant, and
no place for a rounding error to hide.

Every published price is an exact integer at this scale:

| Model              | $/Mtok in / out | nanoUSD per token in / out |
| ------------------ | --------------- | -------------------------- |
| Haiku 4.5          | 1 / 5           | 1000 / 5000                |
| Sonnet 4.5         | 3 / 15          | 3000 / 15000               |
| Opus               | 15 / 75         | 15000 / 75000              |
| Gemini Flash       | 0.30 / 2.50     | 300 / 2500                 |
| cheapest realistic | 0.075 / 0.30    | 75 / 300                   |

A 3000-in / 800-out Sonnet turn costs 9,000,000 + 12,000,000 = 21,000,000
nanoUSD ($0.021). At `markupBps = 15_000` the user is charged 31,500,000 µC
= **31.5 credits**.

### Why `bigint`

Balances comfortably fit in a JS `number` (a $100 balance is 1e11 µC,
`Number.MAX_SAFE_INTEGER` is 9e15), but the money path uses `bigint`
throughout anyway: the columns are `bigint(..., { mode: 'bigint' })` and
`credit.repo.ts` does its arithmetic in `bigint`. The ergonomic cost is
confined to one file, and it removes an entire class of question from code
review. Conversion to `number` happens only at the API boundary.

## Pricing

A `pricing` jsonb column on `ai_models`, discriminated by `kind`. V1
implements `token` only; the other variants are declared so v2 is additive.

```ts
export type AiModelPricing =
  | {
      kind: 'token';
      nanoUsdPerInputToken: number;
      nanoUsdPerOutputToken: number;
      // Real platform cost of a cache hit / write. Used only for margin
      // analytics, never for what the user is charged. Absent means
      // caching is not modeled for this model.
      nanoUsdPerCacheReadToken?: number;
      nanoUsdPerCacheWriteToken?: number;
      // Overrides config.creditMarkupBps for this model.
      markupBps?: number;
    }
  | { kind: 'image'; nanoUsdPerImage: number } // v2
  | { kind: 'video'; nanoUsdPerSecond: number }; // v2
```

Prices are maintained by hand, same as `capabilities` today. A model with no
`pricing` (or a `kind` the charger does not implement) is **not chargeable**:
the gate refuses to start a run on it rather than silently giving it away.
This fails closed, matching the `capabilities` convention.

Prices change over time. Rather than a versioned `ai_model_prices` table,
every usage row **snapshots the unit prices it charged at**. That gives
exact replay and audit for free. A price-history table can be added later
without touching the ledger.

## The charge formula

```
billableInput  = normalizeUsage(provider, steps).billableInputTokens
billableOutput = usage.outputTokens ?? 0

costNanoUsd = BigInt(billableInput)  * BigInt(nanoUsdPerInputToken)
            + BigInt(billableOutput) * BigInt(nanoUsdPerOutputToken)

chargedMicroCredits = ceilDiv(costNanoUsd * BigInt(markupBps), 10_000n)
```

with `ceilDiv(a, b) = (a + b - 1n) / b`.

Both multiplications are exact. The single `ceilDiv` is the only rounding in
the system, it happens once per charge, and it always rounds in the
platform's favour. Per-token rounding never occurs, which is what
"token-exact" means here.

The real platform cost is computed alongside it and stored, but never
charged:

```
uncachedInput = billableInput - cacheReadTokens - cacheWriteTokens

actualCostNanoUsd = uncachedInput    * nanoUsdPerInputToken
                  + cacheReadTokens  * (nanoUsdPerCacheReadToken  ?? nanoUsdPerInputToken)
                  + cacheWriteTokens * (nanoUsdPerCacheWriteToken ?? nanoUsdPerInputToken)
                  + billableOutput   * nanoUsdPerOutputToken
```

Margin on a run is `chargedMicroCredits - actualCostNanoUsd`, directly
comparable because both are in nanoUSD.

`uncachedInput` is **derived by subtraction**, not taken from
`NormalizedUsage.noCacheInputTokens`, even though the provider reports that
field. Deriving guarantees
`uncachedInput + cacheReadTokens + cacheWriteTokens === billableInput` by
construction, so the actual-cost breakdown can never disagree with the
number the user was charged. Reading the provider's field would be exact
when populated but silently zero when it is not, which would overstate
margin with nothing to indicate it. For an analytics-only number,
consistency with the charge beats provider-exactness.

`noCacheInputTokens` stays on `NormalizedUsage` as reported provider truth.
It is unused by the charge path today; its value is as a v2 analytics input
and as a check on the decomposition assumption above.

## Cached tokens

The user is charged as if no cache existed. On the SDK versions installed
here that turns out to be the **simple** case, not the hard one.

> **Corrected 2026-07-27 during WP1.** An earlier draft of this section
> claimed cache counts live only in `providerMetadata`, that Anthropic's
> `inputTokens` excludes cache reads, and that billable input therefore
> needed a per-provider addition. That was true of the older
> `LanguageModelV2` provider spec and is **wrong** for this repo. Following
> it would have double-counted cache reads and overcharged every cached
> Anthropic run. The old table is gone rather than kept for reference: a
> wrong billing table is worse than no table.

Verified by reading the installed adapter sources, not provider docs, which
describe the raw API rather than what the SDK normalizes it to. Installed:
`ai@7.0.34`, `@ai-sdk/anthropic@4.0.18`, `@ai-sdk/openai@4.0.17`,
`@ai-sdk/google@4.0.21`, `@ai-sdk/google-vertex@5.0.25`. All report
`specificationVersion = "v4"`.

Under `LanguageModelV4`, every adapter normalizes cache counts itself before
usage reaches application code. `convert-anthropic-usage.ts` returns:

```ts
inputTokens: {
  total: inputTokens + cacheCreationTokens + cacheReadTokens,
  noCache: inputTokens,
  cacheRead: cacheReadTokens,
  cacheWrite: cacheCreationTokens,
}
```

and `ai@7.0.34` surfaces that to the app as `usage.inputTokens` (the
cache-inclusive total) plus `usage.inputTokenDetails.{noCacheTokens,
cacheReadTokens, cacheWriteTokens}`. OpenAI's `prompt_tokens` and Google's
`promptTokenCount` were already cache-inclusive. All providers are now
uniform.

| Field                                      | Meaning                                  |
| ------------------------------------------ | ---------------------------------------- |
| `usage.inputTokens`                        | cache-inclusive total, **all providers** |
| `usage.inputTokenDetails.noCacheTokens`    | uncached portion                         |
| `usage.inputTokenDetails.cacheReadTokens`  | cache hits                               |
| `usage.inputTokenDetails.cacheWriteTokens` | cache writes                             |
| `usage.outputTokens`                       | total                                    |
| `usage.outputTokenDetails.reasoningTokens` | already inside `outputTokens`            |

So `billableInputTokens = Σ step.usage.inputTokens`, with **no per-provider
branching**. That total is by construction what the prompt would have cost
with no cache, which is exactly the product decision. `provider` is still a
parameter to `normalizeUsage`, used only to `logger.warn` on an unrecognized
provider, as a canary against a future SDK or provider regression.

`reasoningTokens` is a breakdown of `outputTokens`, not an addition to it.
Recorded for display, never charged.

### Cache writes are a small platform loss

`inputTokens` includes cache **writes**, charged at the plain input rate.
Anthropic bills cache creation at 1.25x, so the first call that populates a
cache loses 0.25x on those tokens, and every subsequent hit gains 0.9x. Net
strongly positive at any reasonable hit rate. `actualCostNanoUsd` prices
`cacheWriteTokens` separately, so margin analytics show this rather than
hiding it.

### Multi-step runs

Chat runs use `stopWhen: stepCountIs(5)`, so a turn with tool calls is
several LLM calls. `normalizeUsage` sums each step's own `usage`, which
carries correct per-step breakdowns. This is why it takes `steps` rather
than a single usage object.

`onEnd(event).usage` is also correctly pre-summed across steps in
`ai@7.0.34` (`totalUsage` is a deprecated alias), but summing steps is used
uniformly so the chat and worker paths share one function.

## Schema

Three new tables, all registered in
`packages/database/src/schema/relations.ts` (schema object plus FK
relations), not just exported from `schema/index.ts`.

### `creditAccount` (table `credit_accounts`)

| Column                | Type   | Notes                                                     |
| --------------------- | ------ | --------------------------------------------------------- |
| `id`                  | text   | `primaryIdColumn`                                         |
| `userId`              | text   | FK → `user.id`, cascade, **unique**                       |
| `balanceMicroCredits` | bigint | `mode: 'bigint'`, not null, default `0`. May go negative. |
| timestamps            |        | `...timestamps`                                           |

The indirection is the whole point. When organisations land, add a nullable
`organisationId` FK and a `CHECK (num_nonnulls(user_id, organisation_id) = 1)`,
create org accounts, and repoint the resolution. The ledger, the usage
history, and every call site stay untouched.

`balanceMicroCredits` is a denormalised cache of `sum(credit_ledger.amount)`.
It exists so the hot path is one indexed read and one conditional update
instead of an aggregate over an ever-growing table. The ledger is the source
of truth; a reconciliation script can rebuild the column at any time.

### `creditLedger` (table `credit_ledger`)

Append-only. Rows are never updated or deleted.

| Column                     | Type      | Notes                                                               |
| -------------------------- | --------- | ------------------------------------------------------------------- |
| `id`                       | text      | `primaryIdColumn`                                                   |
| `creditAccountId`          | text      | FK → `credit_accounts.id`, cascade, indexed                         |
| `amountMicroCredits`       | bigint    | signed. Negative for `usage`, positive for `grant` / `refund`.      |
| `kind`                     | text enum | `grant` \| `usage` \| `refund` \| `adjustment`. (`purchase` in v2.) |
| `usageEventId`             | text      | nullable FK → `credit_usage_events.id`, `set null`                  |
| `idempotencyKey`           | text      | not null, **unique**                                                |
| `balanceAfterMicroCredits` | bigint    | balance immediately after this row was applied                      |
| `description`              | text      | nullable, free text for manual grants and adjustments               |
| timestamps                 |           | `...timestamps`                                                     |

- `balanceAfter` is stored, not derived, so the history is readable without
  a window function and a corrupted balance is easy to spot.
- `idempotencyKey` is the double-charge guard. Format
  `<feature>:<callId>`, e.g. `chat:abc123`. The AI SDK's `callId` is unique
  per generation call and is already available on `onEnd`. Worker runs use
  `workflow:<jobId>:<nodeId>:<callId>`. Manual grants use
  `grant:<uuid>`. A unique-violation on insert means the charge already
  landed and is swallowed, not retried.
- Index on `(creditAccountId, createdAt desc)` for the history endpoint.

### `creditUsageEvent` (table `credit_usage_events`)

The audit trail. One row per charged LLM run.

| Column                 | Type      | Notes                                                                                         |
| ---------------------- | --------- | --------------------------------------------------------------------------------------------- |
| `id`                   | text      | `primaryIdColumn`                                                                             |
| `creditAccountId`      | text      | FK → `credit_accounts.id`, cascade, indexed                                                   |
| `workspaceId`          | text      | FK → `workspace.id`, cascade, indexed                                                         |
| `userId`               | text      | nullable FK → `user.id`, `set null`. Who ran it, for per-member breakdowns once orgs exist.   |
| `aiModelId`            | text      | nullable FK → `ai_models.id`, `set null`                                                      |
| `provider`             | text      | denormalised, survives model deletion                                                         |
| `model`                | text      | denormalised                                                                                  |
| `modelDisplayName`     | text      | denormalised. What the user saw at the time. See [Data fetching](#data-fetching).             |
| `feature`              | text enum | `chat` \| `workflow` \| `team`. (`imagegen`, `videogen`, `title`, `embedding`, `tool` in v2.) |
| `refType`              | text      | nullable, e.g. `chat`, `workflowRun`                                                          |
| `refId`                | text      | nullable, the id of that entity. Not an FK; deliberately loose so history survives deletion.  |
| `inputTokens`          | integer   | as reported                                                                                   |
| `outputTokens`         | integer   | as reported                                                                                   |
| `reasoningTokens`      | integer   | nullable. Already included in `outputTokens`; recorded for breakdown only, never added.       |
| `cacheReadTokens`      | integer   | not null, default 0                                                                           |
| `cacheWriteTokens`     | integer   | not null, default 0                                                                           |
| `billableInputTokens`  | integer   | after `normalizeUsage`, this is what was charged                                              |
| `billableOutputTokens` | integer   |                                                                                               |
| `unitPrices`           | jsonb     | snapshot of the `pricing` object in effect                                                    |
| `markupBps`            | integer   | the multiplier actually applied                                                               |
| `costNanoUsd`          | bigint    | pre-markup, at list price, as charged                                                         |
| `actualCostNanoUsd`    | bigint    | real provider cost including cache discounts                                                  |
| `chargedMicroCredits`  | bigint    | post-markup, post-ceil. Mirrors the ledger row's magnitude.                                   |
| `durationMs`           | integer   | nullable                                                                                      |
| timestamps             |           | `...timestamps`                                                                               |

**`reasoningTokens` is already part of `outputTokens`** for Anthropic and
OpenAI. It is stored for display only. Adding it would double-charge every
thinking model.

## Code placement

**No new package.** An earlier draft proposed a `@repo/credits`; it does not
earn its keep. `AiModelPricing` is defined in
`packages/database/src/schema/aimodel.schema.ts`, so a credits package would
depend on `@repo/database` for the very type it operates on: a package that
wraps a package. The charging logic splits cleanly across two packages that
already exist.

Every function below returns a **named interface**, never an inline object
type. Money code is read far more often than it is written, and a named
return type is what makes a call site legible without jumping to the
definition. This matches `ChatSummaryResponse` in `chat.service.ts` and
`TaskWithBoardInfo` / `TaskDueForReminder` in `task.repo.ts`.

### `@repo/ai` — usage normalization

One pure function, in `packages/ai/src/usage.ts`:

```ts
export interface NormalizedUsage {
  billableInputTokens: number;
  billableOutputTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  noCacheInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function normalizeUsage(provider: string, steps: StepResult[]): NormalizedUsage;
```

This is the only piece that must not live in the DB layer: it needs AI SDK
`StepResult` and provider-metadata types, and `@repo/database` has no
business learning those. `@repo/ai` already owns provider dispatch
(`getLanguageModel({ provider, model })`), so per-provider cache token
semantics is exactly its job. The provider table from
[Cached tokens](#cached-tokens) goes in this file's comment.

### `@repo/database` — `repositories/credit.repo.ts`

Everything else, following the existing repo conventions:

```ts
export interface CreditSpendState {
  creditAccountId: string;
  balanceMicroCredits: bigint;
  allowed: boolean;
}

export interface CreditSettlement {
  chargedMicroCredits: bigint;
  costNanoUsd: bigint;
  balanceAfterMicroCredits: bigint;
}

export interface SettleCreditUsageParams extends NormalizedUsage {
  creditAccountId: string;
  workspaceId: string;
  userId: string | null;
  aiModelId: string;
  feature: CreditUsageFeature;
  refType: string | null;
  refId: string | null;
  durationMs: number | null;
  idempotencyKey: string;
}

export interface GrantCreditsParams {
  creditAccountId: string;
  amountMicroCredits: bigint;
  kind: CreditLedgerKind;
  description: string | null;
  idempotencyKey: string;
}

// Pre-flight gate.
//
// `workspaceId` is a LOCATOR for the billing entity, not a billing scope.
// Credit accounts are never per-workspace: one user's workspaces all draw
// from one balance. This answers "who pays for work done here", by
// resolving workspace -> owner -> account and reading the balance in one
// join. See "Billing entity resolution" below.
//
// Returns a result, never throws for business reasons. `null` means the
// billing entity has no credit account, which the caller treats as
// "no credits".
export function resolveCreditSpendState(params: {
  workspaceId: string;
}): Promise<CreditSpendState | null>;

// The same state, for the user-global `/credit/balance` and `/credit/usage`
// routes, which have no workspace in scope to locate the billing entity
// with. A direct single-table read, never a workspace lookup chained into
// `resolveCreditSpendState`: that would cost a second query and would read
// as a zero balance for a user granted credits before they created their
// first workspace. This is the function that gains an `organisationId`
// overload when the billing entity moves.
export function getCreditSpendStateForUser(params: {
  userId: string;
}): Promise<CreditSpendState | null>;

// Post-flight settlement. One transaction. Idempotent on `idempotencyKey`;
// `null` means this run was already settled.
export function settleCreditUsage(
  params: SettleCreditUsageParams,
): Promise<CreditSettlement | null>;

// Manual grant / adjustment.
export function grantCredits(params: GrantCreditsParams): Promise<void>;

// History endpoint.
export function listCreditUsageEvents(params: {
  creditAccountId: string;
  limit: number;
  offset: number;
  sort: 'asc' | 'desc';
}): Promise<CreditUsageEvent[]>;

export function countCreditUsageEvents(params: { creditAccountId: string }): Promise<number>;
```

`SettleCreditUsageParams` carries the token counts so they flow from
`@repo/ai` to the repository without being reordered. It cannot literally
`extends NormalizedUsage`: that would make `@repo/database` depend on
`@repo/ai`, which is the boundary this section draws. The repo file declares
a local `NormalizedUsageFields` with identical field names, so
`{ ...normalizeUsage(provider, steps), ... }` satisfies it structurally at
every call site with no cast. The duplication is deliberate and commented.
`CreditUsageEvent`, `CreditUsageFeature`, and `CreditLedgerKind` come from
the schema, re-exported by the repo file the way `task.repo.ts` re-exports
`Task` and `TaskStatus`.

### Data fetching

The house pattern is the relational query builder (`db.query.x.findMany`
with `with` and explicit `columns`) for entities and their relations, and a
projected `.select({...}).innerJoin(...)` when only a few scalars are needed
across tables. Credits use both, and one place uses neither.

**Gate: one join.** Resolving the billing entity and reading its balance are
the same question, so they are one function and one projected join, the same
shape as `listTasksDueForReminder` (`task.repo.ts:416`):

```sql
SELECT ca.id, ca.balance_micro_credits
  FROM workspaces w
  JOIN credit_accounts ca ON ca.user_id = w.owner_id
 WHERE w.id = $1
```

RQB would work here but would materialise the whole workspace and user rows
to reach two scalars. Why this joins through the workspace at all is the
next section.

**History: no join at all.** `listCreditUsageEvents` reads
`credit_usage_events` and nothing else. It does **not** join `ai_models` for
the display name, which is why `modelDisplayName` is denormalised onto the
row next to `provider` and `model`.

This is a correctness rule, not an optimisation. A usage row is a financial
record. Joining `ai_models` would make historical charges mutate whenever
someone renames a model, and would blank the name entirely once a model row
is deleted (`aiModelId` is `set null`). An invoice line has to render the
same way in a year as it did on the day it was written. The same reasoning
already put `provider` and `model` on the row; `modelDisplayName` was the
one I missed.

The denormalisation is free: `settleCreditUsage` already reads the
`ai_models` row inside the transaction to get `pricing`, so
`provider`, `model`, and `displayName` come from a read that has to happen
anyway.

`aiModelId` stays as a nullable FK. It is for grouping analytics while the
model exists, never for rendering the user's history.

**Ledger:** `credit_ledger` is queried by `creditAccountId` alone and joins
nothing. `usageEventId` exists to walk from a ledger row to its detail when
debugging, not to power a list view.

### Billing entity resolution

**A credit account is never per-workspace.** It is per user today and per
organisation later. One user's three workspaces all draw from one balance.

The `workspaceId` parameter is a **locator**, not a scope. Every charge
happens somewhere, and the workspace is the thing that says where. The
resolution chain answers "who pays for work done here":

| Era                   | Chain                                                          |
| --------------------- | -------------------------------------------------------------- |
| v1                    | `workspace.ownerId` → `credit_accounts.user_id`                |
| multi-user workspaces | unchanged; still `ownerId`, now distinct from the acting user  |
| organisations         | `workspace.organisationId` → `credit_accounts.organisation_id` |

#### Why not just resolve by the acting `userId`?

Every call site already has one, so it would be a single-table lookup with
no join: `apps/api` has `c.get('user')`, `runChatStream` takes `userId`, and
the worker has `run.workflow.userId` (`engine.ts:126`). Today that returns
the identical account, provably: `workspaceGuard` loads the workspace with
`ownerId: user.id`, so `workspace.ownerId === c.get('user').id` by
construction.

It is rejected because the two are only _coincidentally_ equal.
`workspace.schema.ts:9-10` already anticipates the divergence:

> Named `ownerId` (not `userId`) to signal one owner now, and to leave room
> for a future `workspace_users` pivot without renaming this column.

Once that pivot lands, a member working in an owner's workspace would be
billed personally instead of the workspace owner being billed. That failure
is silent: no type error, no failing test, just charges landing on the wrong
account and a ledger that has to be unwound by hand. Paying one indexed
join now to remove that class of bug is worth it; the reverse trade is not.

Note this is a **different** argument from the organisation migration. Even
if organisations never ship, `workspace_users` alone justifies resolving
through the workspace.

#### Why a join rather than two queries

Two of the three call sites have not loaded the workspace when they need to
gate: `runChatStream` has `userChat.workspaceId`, and the worker has
`run.workflow.workspaceId` (`engine.ts:127`). Only the guarded HTTP path
could skip the join, since `workspaceGuard` already put the workspace in
context, and it is not worth a second code path to save one indexed join
there.

### Account creation

Credit accounts are created **only by `grantCredits`**, never lazily on the
read path. A brand-new account would have a zero balance, so the gate would
refuse the run anyway. Creating one on the gate path would mean a write on
the hottest read in the system to produce a row that changes no outcome.
"No account" and "zero balance" are the same answer to the gate, so it
returns `null` and the caller refuses.

`computeCharge` and `ceilDiv` are module-private helpers in the same file,
exported only for tests. Pure domain math next to the write that needs it is
the established pattern here: `fractional-indexing` is a `@repo/database`
dependency and `sortOrder` ranks are computed in `task.repo.ts`, not in a
separate ordering package.

`settleCreditUsage` takes `aiModelId` and reads the `pricing` row **inside
the transaction**, rather than accepting prices from the caller. The
snapshot written to `unitPrices` is then guaranteed to be the row the charge
was computed from, and no call site can pass stale or hand-rolled prices.

`apps/worker` composes `@repo/database` and `@repo/ai` directly rather than
reusing `apps/api` services (`run-referenced-agent.ts`), so it calls
`resolveCreditSpendState` itself and fails the job on refusal.

### `apps/api` — the gate policy

`apps/api` has two entry points that spend, HTTP and WebSocket, and only one
of them can run middleware. So the policy lives in a service function and
both entry points call it:

```ts
// apps/api/src/services/credit.service.ts
//
// The single place that decides what "out of credits" means. Returns the
// spend state so callers can reuse the balance without a second query.
export async function assertCanSpend(params: {
  workspaceId: string;
}): Promise<CreditSpendState | null>;
```

Returns `null` when `CREDITS_ENABLED` is off, without querying. Throws
`PaymentRequiredException` (402, already in
`apps/api/src/exceptions/index.ts`) when the account is missing or the
balance is not positive.

`resolveCreditSpendState` returns a result rather than throwing, so
this policy decision is made in `apps/api` and `@repo/database` stays free
of HTTP concerns.

### `creditGuard`

`apps/api/src/middlewares/creditGuard.ts`, following `workspaceGuard`:

```ts
export type CreditGuardEnv = WorkspaceGuardEnv & {
  Variables: WorkspaceGuardEnv['Variables'] & {
    creditSpendState: CreditSpendState | null;
  };
};

export const creditGuard = createMiddleware<CreditGuardEnv>(async (c, next) => {
  const workspace = c.get('workspace');
  c.set('creditSpendState', await assertCanSpend({ workspaceId: workspace.id }));
  await next();
});
```

It reads `c.get('workspace')` rather than the route param, so it needs no
validation and no query of its own beyond the gate. It **must** be mounted
after `workspaceGuard`.

**Mounted per route, never with `.use()` on a controller.** Only a minority
of workspace-scoped routes spend anything, and a guard that fires on every
`GET` in order to serve one `POST` is the mistake this design is avoiding.

V1 has exactly one such route:

```ts
.post('/:workflowId/run', creditGuard, validWorkflowIdParam, ..., async (c) => {
```

`workflow.controller.ts:154`. V2 adds `imagegen.controller.ts:37` and
`videogen.controller.ts:39` (`POST /`), both already behind
`workspaceGuard`, so they are a one-line change each.

The guard stashes `creditSpendState` so a handler that needs the balance
(to decide how many images to allow, in v2) does not query twice. V1
handlers ignore it.

#### The guard does not replace the worker's gate

`POST /:workflowId/run` enqueues; the LLM calls happen in `apps/worker`,
possibly much later, and one run makes many of them. The two gates answer
different questions:

- **`creditGuard` at enqueue**: fail fast. The user gets an immediate 402
  instead of a run that appears to start and then dies.
- **Worker per-node gate**: the balance can be exhausted between enqueue and
  execution, or partway through a long workflow.

A run refused mid-execution fails the run with a reason the UI can
distinguish from a generic error, same as any other node failure.

#### The WS chat path

`runChatStream` cannot use middleware, so it calls `assertCanSpend`
directly, after the chat is fetched (it needs `userChat.workspaceId`) and
before `streamText`. `ws.controller.ts:23` already maps `HTTPException` to
error frames via `toErrorPayload`, so the 402 reaches the client unchanged.

This is the one place where the gate is not a guard, and the reason is the
pre-existing split noted at `chat.service.ts:41-43`: the streaming pipeline
predates the container model and still scopes by `userId`. When that path is
aligned with the workspace guard, the gate moves to `creditGuard` with it
and `assertCanSpend` stays put.

### Settlement transaction

```sql
-- 1. debit, unconditional: v1 permits the balance to go negative
UPDATE credit_accounts
   SET balance_micro_credits = balance_micro_credits - $charged
 WHERE id = $accountId
RETURNING balance_micro_credits;

-- 2. insert the usage event
-- 3. insert the ledger row with balance_after from step 1
--    ON CONFLICT (idempotency_key) DO NOTHING
```

All three in one transaction. The `UPDATE ... RETURNING` serialises
concurrent settlements on the same account at the row level, so
`balanceAfter` is always consistent even with several chats streaming at
once.

A unique violation on `idempotencyKey` means this run was already settled
(a retried job, a reconnect). The whole transaction rolls back and
`settleCreditUsage` returns `null`. Nothing is charged twice.

Settlement failures must never fail the work that was already done. In chat
the response is already streamed by then; in the worker the agent run has
already produced its output. Wrap the call in `tryCatch`, log at `error`,
and move on. A dropped charge is a bug to fix in reconciliation, not a
reason to break a completed turn or fail a finished node.

The idempotency key is composed from identifiers that survive a retry:
`chat:<callId>` for chat, `workflow:<runId>:<nodeId>:<callId>` for the
worker. `runId` rather than the BullMQ job id, because the executors never
receive the job object and `runId` is equally stable across attempts. Note
that a genuine full re-execution of a node after a crash mints new
`toolCallId`s and charges again, which is correct: those are real new tokens.
The key prevents double-settling one attempt, not re-billing genuine rework.

## Overdraft

You cannot know a run's cost before it finishes, so a user with 5 credits
can start an Opus turn costing 400. V1 accepts this:

- Before a run, refuse if `balanceMicroCredits <= 0`.
- After a run, debit the true cost unconditionally. The balance may go
  negative.
- The next request is then refused by the same gate.

Worst case exposure is one turn per account, bounded by `maxOutputTokens`
and the 5-step cap. The ledger stays truthful, and the debt is carried
against the next grant rather than written off. A reservation scheme
(estimate a hold, release the difference) costs a hold/release state machine
plus cleanup for crashed runs, which is not worth it for a showcase app.

## Call sites

| Site                                   | File                                                                                 | Gate                                                                                                                           | Settle                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Workflow run enqueue                   | `apps/api/src/controllers/workflow.controller.ts:154`                                | `creditGuard` on the route                                                                                                     | n/a, spends nothing itself                                            |
| Chat turn                              | `apps/api/src/services/chat.service.ts`                                              | `assertCanSpend` in `runChatStream`, after the chat is fetched and before `streamText`, alongside the existing in-flight check | in `streamText`'s `onEnd`, next to the current `logger.debug` at :519 |
| Workflow agent node (referenced agent) | `apps/worker/src/workflow/executors/run-referenced-agent.ts`                         | `resolveCreditSpendState` before the run                                                                                       | where `result.steps` is in scope                                      |
| Workflow agent node (default agent)    | `apps/worker/src/workflow/executors/agent.executor.ts`, the `!config.agentId` branch | same                                                                                                                           | same                                                                  |
| Team node member call                  | `apps/worker/src/workflow/executors/team.executor.ts`, via `runReferencedAgent`      | same                                                                                                                           | same                                                                  |
| Team node lead call                    | `apps/worker/src/workflow/executors/team.executor.ts`, `executeTeam`                 | same                                                                                                                           | same                                                                  |

The four worker rows are four _call sites_, not four implementations. They
share one pair of helpers exported from `run-referenced-agent.ts`:

- `gateCreditSpend({ workspaceId })` returns `null` when `CREDITS_ENABLED`
  is off, and throws `InsufficientCreditsError` when there is no account or
  the balance is not positive. Callers never check `creditsEnabled`
  themselves.
- `settleWorkflowUsage({ spendState, ... })` no-ops on a `null` spendState,
  which is what pairs gating and settling so they can never be skipped
  independently.

Only `feature` and `callId` differ per site. `callId` is `'agent'` for
either agent-node branch (mutually exclusive, one per execution), `'lead'`
for the team lead, and the AI SDK's `toolCallId` for each team member call,
so no two charges under one `runId`/`nodeId` can collide.

Earlier drafts of this table listed only the referenced-agent and team-member
rows. That was an incomplete enumeration of the goal above, not a decision to
leave the other two free: a team lead orchestrating a node can spend
substantial tokens, and the default-agent branch is an ordinary billable run.

`runChatStream` already throws `HTTPException` subclasses and the WS
controller maps them to error frames via `toErrorPayload`
(`apps/api/src/controllers/ws.controller.ts:23`), so a 402 reaches the
client with no new plumbing.

The workflow executors already thread `usage` through their trace types
(`WorkflowTokenUsage`), so those two sites are close to free. They will need
`steps` threaded alongside it for the cache normalization.

Settling is the same shape everywhere; only the gate differs by entry point
(`creditGuard` for guarded HTTP routes, `assertCanSpend` for the WS chat
path, `resolveCreditSpendState` in the worker):

```ts
const spendState = await assertCanSpend({ workspaceId });  // throws 402
// ...run...
await settleCreditUsage({
  creditAccountId: spendState.creditAccountId,
  ...normalizeUsage(provider, steps),
  ...
});
```

When `CREDITS_ENABLED` is off, `assertCanSpend` returns `null` and settling
is skipped. Both branches must be skipped together: settling without a gate
would charge accounts that were never checked.

## API

Per the api-standards PRD: thin controller, service holds the logic,
standard envelope, standard pagination.

Credits belong to the account, not to a workspace, so these are
**user-global** routes:

```
/credit/balance   GET
/credit/usage     GET   paginated
```

`apps/api/src/services/credit.service.ts` declares the response shapes as
named interfaces, following `ChatSummaryResponse` / `ChatListResponse` in
`chat.service.ts`:

```ts
export interface CreditBalanceResponse {
  balanceCredits: number;
  balanceMicroCredits: string;
}

export interface CreditUsageResponse {
  id: string;
  feature: CreditUsageFeature;
  provider: string;
  modelDisplayName: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number | null;
  credits: number;
  createdAt: Date;
}

export interface CreditUsageListResponse {
  usages: CreditUsageResponse[];
  totalCount: number;
}
```

- **`GET /credit/balance`** → `{ credit: CreditBalanceResponse }`.
  `balanceCredits` is a `number` for display (µC / 1e6, so 31500000 → 31.5);
  `balanceMicroCredits` is a **string**, since `bigint` is not JSON.
- **`GET /credit/usage`** → `{ usages: [...], meta: { totalCount } }`,
  standard `page` / `limit` / `sort`.
- `CreditUsageResponse` deliberately omits `actualCostNanoUsd`,
  `costNanoUsd`, `markupBps`, and `unitPrices`. Those are the platform's
  margin, not the user's business. Mapping through an explicit interface
  rather than returning the row is what keeps them from leaking.

## Frontend

Minimal in v1:

- Balance in the user menu, fetched once per session and refetched after a
  chat turn ends.
- A usage table on the account settings page, paginated.
- When a run is refused with 402, a toast pointing at the balance. The
  message must distinguish "out of credits" from a generic failure, or the
  first support question will be "why did my chat stop working".

## Grants

No UI, no purchase flow. Credits are inserted by hand:

```
pnpm --filter @repo/database credits:grant -- <userEmail> <credits> "<description>"
```

`packages/database/src/scripts/grant-credits.ts`, alongside the existing
`backfill-workspace.ts`, run with `tsx`. It resolves the account, calls
`grantCredits` with `kind: 'grant'` and `idempotencyKey: grant:<uuid>`, and
prints the new balance. This keeps grants going through the same
transaction as everything else, so the balance cache and the ledger cannot
drift.

## Config

Two additions to `packages/config`:

| Var                 | Default | Notes                                                                                                             |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------- |
| `CREDIT_MARKUP_BPS` | `15000` | multiplier in basis points; `10000` = cost price                                                                  |
| `CREDITS_ENABLED`   | `false` | master switch. Off means no gate and no settlement, so the system can ship dark and be turned on per environment. |

Both are non-sensitive, so they are direct properties, not `getSecret`.

## Work packages

Split so agents can work in parallel. Dependency graph:

```
WP0 packages foundation ──┐
WP1 @repo/ai usage    ────┤
                          ├── WP2 apps/api  ──── WP4 apps/web
                          └── WP3 apps/worker
```

WP0 and WP1 have no shared files and start together. WP2 and WP3 run in
parallel once both land. WP4 needs WP2's endpoints.

### Parallelization rules

- **Each package owns disjoint files.** No package edits another's.
- **Shared files get append-only touches**: `schema/index.ts`,
  `repositories/index.ts`, `packages/ai/src/index.ts`, and `app.ts` mounts
  are one line each.
- After editing `@repo/database`, `@repo/ai`, or `@repo/config` sources, run
  `pnpm --filter @repo/<pkg> build`. The dev script does not watch package
  sources.
- Every package uses this PRD as its spec. Return types are named
  interfaces, never inline object types. No `as any`.

### WP0 — Packages foundation (blocks WP2, WP3, WP4)

`packages/config`, `packages/database`.

- `CREDIT_MARKUP_BPS` (default `15000`) and `CREDITS_ENABLED` (default
  `false`) in `ConfigSchema`, exposed as direct properties.
- `AiModelPricing` type plus the `pricing` jsonb column on `ai_models`
  (`aimodel.schema.ts`), nullable. No seeding: prices are set by hand, same
  as `capabilities`.
- New `schema/credit.schema.ts`: `credit_accounts`, `credit_ledger`,
  `credit_usage_events`, per the [Schema](#schema) tables. Register all
  three in `relations.ts` (schema object **and** FK relations), not just
  `schema/index.ts`.
- `repositories/credit.repo.ts`: `resolveCreditSpendState`,
  `settleCreditUsage`, `grantCredits`, `listCreditUsageEvents`,
  `countCreditUsageEvents`, plus module-private `computeCharge` / `ceilDiv`.
- `scripts/grant-credits.ts` plus its `package.json` script entry.
- `pnpm --filter @repo/database db:push`. Do not hand-write SQL migrations.

### WP1 — `@repo/ai` usage normalization (blocks WP2, WP3)

`packages/ai` only. One file, `src/usage.ts`, exporting `NormalizedUsage`
and `normalizeUsage(provider, steps)`, re-exported from `src/index.ts`.

The whole package is the [Cached tokens](#cached-tokens) section: the
per-provider table, summing cache counts across `steps` rather than reading
the top-level `providerMetadata`, and not double-counting `reasoningTokens`.
Small surface, high blast radius if wrong.

### WP2 — `apps/api` gate, guard, endpoints (needs WP0, WP1)

- `services/credit.service.ts`: `assertCanSpend`, the balance and usage
  read services, and the three response interfaces.
- `middlewares/creditGuard.ts` and `CreditGuardEnv`.
- `controllers/credit.controller.ts` for `GET /credit/balance` and
  `GET /credit/usage`, mounted in `app.ts`.
- One-line `creditGuard` mount on `workflow.controller.ts`'s
  `POST /:workflowId/run`.
- `chat.service.ts`: `assertCanSpend` before `streamText`, `settleCreditUsage`
  in `onEnd`, both wrapped so settlement failure never breaks a finished
  turn.

### WP3 — `apps/worker` charge sites (needs WP0, WP1)

`workflow/executors/run-referenced-agent.ts` and `team.executor.ts`: gate
before each run, settle after. Thread `steps` alongside the existing
`usage` so cache counts survive. Refusal fails the run with a reason the UI
can distinguish from a generic error.

### WP4 — `apps/web` (needs WP2)

Balance in the user menu, usage table on account settings, and a 402 toast
that reads as "out of credits" rather than a generic failure.

1. **Image and video pricing.** FLUX pricing varies by resolution, so
   `nanoUsdPerImage` may need to be a map keyed by resolution. Neither
   generation path has a usage callback, so the charge has to be synthesised
   from the request parameters at the point the job succeeds.
2. **Invisible spend.** Current intent is record-but-don't-charge, which
   needs a `chargedMicroCredits = 0` path and a `recorded` flag so those
   rows can be excluded from the user-facing usage list while still feeding
   margin analytics.
3. **Aborted runs.** Charging partial usage means settling from
   `onAbort`, where only `steps` is available (no aggregated `usage`), so
   the totals have to be summed by hand.
4. **Reconciliation.** A cron that recomputes `balanceMicroCredits` from the
   ledger and alerts on drift. Cheap insurance once real money is involved.
5. **Grants.** Signup bonus, monthly refill, expiry of granted (vs
   purchased) credits, and whether a negative balance is forgiven or carried
   on refill.
