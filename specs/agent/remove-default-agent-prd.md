# Remove the default agent (PRD)

> **Status: implemented** (2026-10-23, PR #138). Every chat, email draft and workflow node
> runs on an agent the user picked. No code picks an agent for the user.

The default agent was a comfort feature from an older chat version, where a new
chat didn't show which agent it used. The chat shows the agent now. Meanwhile
the default agent became a hidden fallback in four places, and the workflow
fallback even runs the platform template directly. This PRD removes the
concept.

First of three PRDs. Then `agent-media-models-prd.md`, then
`specs/organizations/ai-models-prd.md`. Each one removes a fallback before the
next adds checks.

## Goals

- A new chat needs an agent, enforced by the API and the web app.
- A user without agents learns that and can create one from a template in one
  click.
- Email auto-draft and workflow nodes run only on a chosen agent.
- Every path costs as few queries as possible from day one: no extra request
  for the empty state, and single-statement writes.

## Non-goals

- No template gallery. `agent_templates` stays as is; the gallery is its own
  PRD later. Quick create lists whatever templates exist.
- No backfill. Workflow nodes without an agent fail with a clear message until
  edited.
- No starter agent at sign-up.

## Removed

- `agents.is_default` and the `agent_default_workspace_idx` partial unique
  index (`db:generate`).
- `getOrCreateDefaultAgentForWorkspace`, `clearOtherDefaultAgentsInWorkspace`
  and `getDefaultAgent` (`agent-template.repo.ts`).
- `isDefault` in the agent API schema, service, controller and web types; the
  "Default" toggle in `AgentUpsertForm.vue` and the badge in
  `AgentManyTable.vue`.
- `resolveDefaultAgentId` in `chat.service.ts`.
- Inline agent nodes in workflows (`agent.executor.ts`, no `agentId`) and the
  default team lead (`resolveDefaultLead` in `team.executor.ts`).

## Chat

### API

- `POST /workspace/:workspaceId/chat`: `agentId` becomes required
  (`chat.schema.ts`).
- `createChatForWorkspace` creates the chat in one statement: an
  `insert ... select` from `agents` where id and workspace match, `returning`.
  No row means 404 "Agent not found". This replaces today's read-then-insert
  (two queries).

### Web

- `useChatAgentSelection`: the selection is the remembered agent if it's
  still in the list, else the first agent of the list, else null. The
  `isDefault` fallback goes away.
- Send stays disabled while no agent is selected.
- **Empty state.** The chat page already loads the agent list for the
  dropdown. A response with zero agents (`meta.totalCount === 0`) switches the composer
  to the empty state. No extra request decides that.
- The empty state says the user needs an agent first, with two actions:
  "Create agent" (opens `/agent/create`) and quick create from a template.

### Quick create from a template

- `GET /agent-template`: id, name, description, model display name of every
  template. One query with the model joined. The web app requests it only
  while the empty state is shown (`enabled` bound to the empty state).
- `POST /workspace/:workspaceId/agent/from-template` with `{ templateId }`:
  one `insert ... select` from `agent_templates`, `returning`. No row means 404. The response is the new agent.
- The web app writes the new agent into the agent list query data and selects
  it. No list refetch.
- One template: the empty state shows a single "Create <name>" button. Several:
  a short list.

## Email auto-draft

`resolveEmailDraftAgent` keeps the override and the account's stored agent.
The personal workspace default agent fallback goes away. Without a candidate,
it returns null and no draft is written. The account settings show "Pick an
agent to enable auto-drafts".

## Workflows

- `packages/workflow/src/config.schema.ts`: the agent node's `agentId` and the
  team node's `leadAgentId` become required. Saving a workflow without them
  fails validation.
- Existing workflows with such a node fail at run time with "Pick an agent for
  this node". The run is marked failed, nothing is charged.
- Web: the "none, use default agent" option in `WorkflowTeamConfigForm.vue`
  goes away. Both selects are required.

## Tests (apps/api, test-first)

- Chat create without `agentId` returns 422; with an agent of another
  workspace returns 404; with a valid agent creates the chat.
- `GET /agent-template` lists templates with their model display name.
- Quick create copies name, description, system prompt, tools, settings and
  model; unknown template returns 404; another workspace's id returns 404 via
  `workspaceGuard`.
- Agent create and update ignore or reject `isDefault`.
- Email auto-draft without an override or stored agent writes no draft.
- Workflow save rejects an agent node without `agentId` and a team node
  without `leadAgentId`.

Worker tests: a stored node without an agent fails the run with the message
above and charges nothing.

## Docs

`apps/docs`: chat (an agent is required, quick create), workflows (agent node
and team lead required), email (auto-draft needs an agent). Remove mentions of
the default agent. Mark `specs/agent/agent-default-and-settings.md` as
superseded for the default-agent part.

## Risks

- **Existing workflows with inline agent nodes or a default lead stop
  working** until edited. Accepted: one prod user, clear message.
- **The seed** still writes one template. Fresh installs show it in quick
  create.

## Slices

Four slices, run in parallel. File ownership is strict: a slice edits only
its own files. Shared files are listed with the exact part each slice owns.

**Contracts (pinned, all slices rely on them):**

- `GET /agent-template` (auth only, no workspace) returns
  `{ templates: Array<{ id, name, description, aiModel: { displayName } }> }`.
- `POST /workspace/:workspaceId/agent/from-template`, body `{ templateId }`,
  returns `201` with the same agent shape as `POST /workspace/:workspaceId/agent`.
- `POST /workspace/:workspaceId/chat` requires `agentId`. Response unchanged.
- Agent responses no longer carry `isDefault`.
- `resolveEmailDraftAgent` keeps its signature and returns null when neither
  candidate resolves.

1. **API** (`packages/database` except `agent-template.repo.ts`'s
   `getDefaultAgent`, `apps/api` except `test/workflow/`, worker email:
   `apps/worker/src/mail/`, `apps/worker/test/email/`,
   `apps/worker/test/support/email-fixtures.ts`). Schema, migration
   (`db:generate`), agent and chat repos, template list and quick create
   (new functions in `agent-template.repo.ts`, new controller), chat
   `insert ... select`, email fallback removal, all API tests for these.
   Test-first.
2. **Workflows** (`packages/workflow`, `apps/worker/src/workflow/`,
   `apps/worker/test/workflow/`, `apps/worker/test/support/workflow-fixtures.ts`,
   `apps/api/test/workflow/`, `apps/web/app/features/workflow/`, and in
   `agent-template.repo.ts` only the deletion of `getDefaultAgent` plus its
   re-export). Required `agentId` and `leadAgentId`, executors fail closed,
   web selects required. Test-first.
3. **Web chat and agents** (`apps/web/app/features/chat/`,
   `apps/web/app/features/agent/`, the email account settings component, new
   composables for templates). Agent selection, disabled send, empty state,
   quick create, `isDefault` removal, email hint. Builds against the
   contracts above.
4. **Docs** (`apps/docs`, `specs/agent/agent-default-and-settings.md`).

i18n: slices 2 and 3 add or remove only their own keys in
`apps/web/i18n/locales/{en-UK,de-DE}.json`.

On-ship bookkeeping (Status, `overview.md`, backlog tick, `specs:index`) is
done by the team lead after the user confirms.
