# Organizations: AI model selection (PRD)

> **Status: decided** (2026-10-23). Org owners and org admins choose which
> catalog models their organization may use. Catalog models can be retired
> with a soft delete.

Every org sees every row of `ai_models` today. This PRD adds a per-org
allowlist, managed in `/settings/organization`. The catalog itself stays
platform data: it ships with the code (seed) and pricing is set by SQL, as
today.

Third of three PRDs. Builds on `specs/agent/remove-default-agent-prd.md` and
`specs/agent/agent-media-models-prd.md`: no code picks an agent or a model,
so every model in use is one a user chose.

## Goals

- An org owner or org admin switches catalog models on and off for their org.
- New catalog models are off for existing orgs until enabled (allowlist).
- A model that is off for the org, or retired from the catalog, is never
  offered and never runs in that org. Everything referencing it fails closed
  with a clear message.
- The platform retires a model with `ai_models.deleted_at` instead of a hard
  delete, so agents are never cascade-deleted.

## Non-goals

- No platform `/admin` area. No UI for the catalog, capabilities or pricing.
- No org-owned models and no org API keys (maybe later).
- No per-workspace selection. The allowlist is per org.
- No credentials check.

## Decisions

| #   | Decision                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Allowlist.** Rows in `organization_ai_models` are the enabled models. A new catalog model is off everywhere until an org enables it.                                   |
| 2   | **Org owner and org admins** manage the list, like invitations and member removal.                                                                                       |
| 3   | **New orgs start with every non-deleted catalog model enabled**, in the sign-up transaction that creates the org, so a new org works right away.                         |
| 4   | **No backfill for existing orgs.** They start with nothing enabled after deploy. An org owner or admin enables models once in the settings card.                         |
| 5   | **At least one text model stays enabled.** Disabling the last one returns 409. Without one the org can't create agents.                                                  |
| 6   | **Catalog retirement is `ai_models.deleted_at`, set by SQL.** Allowlist rows stay, so restoring the model (clearing `deleted_at`) restores it everywhere it was enabled. |

## Changes

### Schema

- `ai_models.deleted_at` already exists (part of `timestamps` in
  `common.schema.ts`). Nothing reads it yet.
- New table `organization_ai_models`: `organization_id` and `ai_model_id`
  (composite primary key), `created_at`. Both FKs cascade on delete. Registered
  in `relations.ts`.
- Generated with `db:generate`. No data migration (decision 4).

### Usable model

A model is usable in an org when it is enabled for the org and not deleted.
One repo function answers that for a list of model ids and one org in a
single query. Every check below uses it.

### API

On the organization controller, logic in `organization.service.ts`:

| Route                                       | Who          | Purpose                                                                                                             |
| ------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| `GET /organization/ai-models`               | owner, admin | Catalog (non-deleted) with an `enabled` flag and the number of agents using each model in the org (one `GROUP BY`). |
| `PUT /organization/ai-models/:aiModelId`    | owner, admin | Enable. 404 for a deleted or unknown model.                                                                         |
| `DELETE /organization/ai-models/:aiModelId` | owner, admin | Disable. 409 for the last enabled text model.                                                                       |

`GET /aimodel` (the pickers) returns only models usable in the caller's org.

### Fail closed

Inside an org, a model that is disabled or deleted is treated the same. Each
check is a join or `exists` in the query that already loads the agent or
model, not an extra query:

- Agent create and update reject it in `aiModelId`, `imageModelId` and
  `videoModelId`.
- Quick create from a template (`specs/agent/remove-default-agent-prd.md`)
  returns 409 "This template's model isn't available in your organization".
  The `insert ... select` carries the check, so it stays one statement.
- The image and video routes reject it.
- A chat or workflow run on an agent whose text model isn't usable fails with
  "This agent's model isn't available. Pick another in the agent settings."
  Nothing is charged.
- The image and video tools treat it like a missing model (see "Agents
  without a media model" in the agent media models PRD).
- The agent page marks the model and requires picking another on save.
- `/text-to-image` and `/text-to-video`: a browser-stored model that's no
  longer in the list is dropped, and the first model is selected.

### Org creation

`createOrganizationForUser` inserts allowlist rows for every non-deleted
catalog model in the same transaction (decision 3).

### Web

New "AI models" card in `/settings/organization`, visible to the owner and
org admins:

- Catalog grouped by modality: display name, provider, a switch.
- Disabling a model that agents use shows a confirm with the agent count.
- The 409 for the last text model shows as a toast.

## Tests (apps/api, test-first)

- Members get 403 on all three routes. Owner and admin succeed.
- Enabling a deleted or unknown model returns 404.
- Disabling the last enabled text model returns 409.
- The list carries the agent count per model.
- `GET /aimodel` excludes disabled and deleted models.
- Agent create and update reject a disabled and a deleted model in all three
  columns.
- Image and video routes reject a disabled model.
- A chat run on an agent with a disabled text model fails with the message
  above and charges nothing.
- Sign-up enables every non-deleted catalog model for the new org.
- Quick create from a template returns 409 when the template's model isn't
  usable in the org.
- One org's allowlist doesn't affect another org.

## Docs

`apps/docs` organization settings page: choosing AI models, what happens to
agents on a disabled model. Self-hosting docs: retiring a model with
`deleted_at`.

## Risks

- **Existing orgs have no models after deploy** (decision 4). Chat, agents and
  generation fail closed until an owner or admin enables models. In prod that's
  one manual step for the maintainer.

- **New catalog models need an opt-in per org.** On ragna.io a new model
  reaches nobody until each org enables it. Accepted, it's the point of the
  allowlist. An announcement or a "new" badge is a later idea.
- **Retiring a model is still SQL.** Fine while the catalog ships with the
  code.

## Slices

Slice 1 runs first, alone, until the schema and the usable-model helpers
exist and `@repo/database` is rebuilt. Then slices 2 to 4 run in parallel.

**Contracts (pinned):**

- Table `organization_ai_models` (`organizationId`, `aiModelId`,
  `createdAt`), registered in `relations.ts`.
- `ai_models.deleted_at`, field `deletedAt`.
- Repo helpers in `ai-model.repo.ts`: `getUsableAiModelIds({ organizationId,
  aiModelIds })` returning `Set<string>` in one query, and a SQL condition
  `isAiModelUsableInOrganization(organizationId, aiModelIdColumn)` for joins
  and `exists` checks in other queries.
- Org routes and their response shapes as in "API" above.

1. **Schema, org routes, org creation** (`packages/database` schema,
   relations, migration, `ai-model.repo.ts`, `organization.repo.ts`;
   `apps/api` organization controller, service, validation, `aimodel`
   controller and their tests). Test-first.
2. **Enforcement** (agent repo and service validation, quick create, image
   and video routes, chat and workflow run checks, the media tools' missing
   model handling, worker executors; their API and worker tests).
   Test-first.
3. **Web** (organization settings card, agent page marking, browser-stored
   model handling on `/text-to-image` and `/text-to-video`).
4. **Docs** (`apps/docs` organization settings and self-hosting pages).

On-ship bookkeeping is done by the team lead after the user confirms.
