# Agent media models (PRD)

> **Status: decided** (2026-10-23). Each agent picks its own image and video
> model. Replaces the platform-wide "default model per modality".

Today the agent's `imageGen` and `videoGen` tools have no model of their own.
They resolve one through `getDefaultAiModelByModality`, which runs `findFirst`
without `orderBy`. Which model runs is effectively random (see Risks in
`specs/imagegen/flux-3-prd.md`). This PRD moves the choice onto the agent and
deletes the platform default.

Second of three PRDs, after `remove-default-agent-prd.md`.

## Goals

- An agent with `imageGen` enabled has an image model. An agent with
  `videoGen` enabled has a video model. Both are picked in the agent's tool
  settings.
- Chat and workflow runs use the agent's model. Workflows inherit it through
  the agent node, no workflow changes.
- No code path picks a model on the user's behalf. `getDefaultAiModelByModality`
  and both `*WithDefaultModel` functions are deleted.
- The video HTTP route takes an `aiModelId`, the same as the image route.

## Non-goals

- No platform default and no `is_default` flag on `ai_models`.
- No per-workspace or per-user default. The `/text-to-image` and
  `/text-to-video` pages keep their browser-stored choice.
- No backfill. Existing agents with a media tool enabled stay without a model
  until someone edits them (see "Agents without a media model").
- No org-level model selection and no soft delete of models. Both are in
  `specs/organizations/ai-models-prd.md`, which adds an "enabled for the
  agent's org" check to the validation below.

## Changes

### Schema

Two nullable columns on `agents`:

- `image_model_id` references `ai_models.id`
- `video_model_id` references `ai_models.id`

Both are indexed. `onDelete: 'set null'`, so a hard-deleted model leaves the
agent without a media model instead of cascading. Generated with `db:generate`.

### Validation (create and update)

In `apps/api/src/services/agent.service.ts`:

- `imageGen` in `tools` requires `imageModelId`. `videoGen` requires
  `videoModelId`.
- The referenced row must exist and have the matching modality (`image` or
  `video`).
- A media model id without its tool enabled is kept. Switching the tool off
  and on again restores the previous choice.

Both checks load the referenced models in one query.

Templates get no media model columns. The template gallery PRD decides what
a template stores; quick create (`remove-default-agent-prd.md`) copies no media
models, and the seeded template has no media tools.

### Tool wiring

`AgentToolContext` gains the agent's resolved image and video model
(`provider`, `model`, `capabilities`). The chat and workflow callers already
load the agent with its text model. They join the two media models in the
same query, no extra round trip.

- `imagen.service.ts`: `createGenImagesWithDefaultModel`,
  `requestGenImagesWithDefaultModel` and `resolveDefaultImageModel` are
  replaced by variants that take the model from the context.
- `videogen.service.ts`: `resolveVideoModel` goes away. `requestGenVideo` and
  `runGenVideo` require `provider` and `model`.
- `ai-model.repo.ts`: `getDefaultAiModelByModality` is deleted.

### Agents without a media model

An agent with `imageGen` or `videoGen` enabled but no model (existing rows,
or a hard-deleted model) still gets the tool. The tool returns
`{ error: 'No image model selected for this agent. Pick one in the agent settings.' }`
(video likewise). The LLM relays that to the user. The agent page shows a
warning on the tool, and saving the agent requires picking a model.

### Video HTTP route

`POST /workspace/:workspaceId/gen-video` swaps the optional `provider` and
`model` for a required `aiModelId`, resolved server side like the image
route. The row must have modality `video`. The `/text-to-video` page sends
its selected model id.

### Web

In the agent's tools tab (`AgentToolList.vue`, `AgentUpsertForm.vue`):

- Enabling `imageGen` or `videoGen` shows a model select under the tool,
  filled from `GET /aimodel` filtered by modality. Reuse `AiModelSelector`.
- The form schema requires the model when its tool is on.

## Tests (apps/api, test-first)

- Create and update reject `imageGen` without `imageModelId`, and `videoGen`
  without `videoModelId`.
- Both reject a model id of the wrong modality.
- A media model id survives switching its tool off.
- The chat image tool uses the agent's image model.
- An agent with `imageGen` and a null image model gets the tool error, and no
  generation row is created.
- The video route rejects a missing `aiModelId` and a non-video model.

Worker tests cover the workflow path: an agent node generates with the
agent's model.

## Docs

`apps/docs` agent tools page: picking the image and video model. Update
`specs/imagegen/flux-3-prd.md` Risks to point here.

## Risks

- **Existing agents lose image and video generation** until edited. Accepted:
  prod has one user, and the tool error says what to do.
- **API clients sending `provider` and `model` to the video route break.** The
  only client is the web app, changed in the same PR.

## Slices

Slice 1 runs first, alone, until its schema step is done (columns, relations,
types rebuilt). Then slices 2 to 4 run in parallel.

**Contracts (pinned):**

- Columns `agents.image_model_id` and `agents.video_model_id`, fields
  `imageModelId` and `videoModelId`, relations `imageModel` and `videoModel`
  in `relations.ts`.
- `AgentToolContext` gains `imageModel` and `videoModel`, each
  `{ provider, model, capabilities } | null`.
- Agent request and response bodies carry `imageModelId` and `videoModelId`
  (string or null).
- `POST /workspace/:workspaceId/gen-video` takes `aiModelId` instead of
  `provider` and `model`.

1. **Schema and agent API** (`packages/database` schema, relations,
   migration, agent repo; `apps/api` agent service, controller, validation and
   tests). Validation rules and their tests. Test-first.
2. **Tool wiring and video route** (`packages/ai` imagen and videogen
   services and tools, `ai-model.repo.ts`, the agent-loading query in chat and
   in the worker executors, `apps/api` videogen controller, service,
   validation and tests, worker tests). Deletes the default-model paths.
   Test-first.
3. **Web** (`AgentToolList.vue`, `AgentUpsertForm.vue`, agent types, the
   `/text-to-video` request). Model selects and required validation.
4. **Docs** (`apps/docs` agent tools page, `specs/imagegen/flux-3-prd.md`
   Risks).

On-ship bookkeeping is done by the team lead after the user confirms.
