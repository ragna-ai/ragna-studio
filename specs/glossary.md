# Glossary

One term per concept. Code, specs, docs and UI text use the term in the first column. Words under
_Avoid_ mean something else here, or several things, so never use them alone for this concept.

Add a term in the same PR that introduces it. Change a term only together with the code that uses it.

## Roles

Role names are always qualified. The full table, with storage and code identifiers, is in the
[organizations v3 PRD glossary](./organizations/v3-prd.md#glossary).

| Term              | Meaning                                                    | _Avoid_                     |
| ----------------- | ---------------------------------------------------------- | --------------------------- |
| platform admin    | Operator of a RAGNA Studio instance.                       | admin                       |
| org owner, admin  | Organization roles. One owner per organization.            | admin, owner (unqualified)  |
| org member        | Anyone with an organization membership, whatever the role. | member                      |
| workspace manager | Workspace role that runs the workspace.                    | admin, owner                |
| workspace editor  | Workspace role that works with the content.                | member, user (for the role) |
| user              | Any signed-in person, whatever their roles.                | member, account             |

## Integrations

| Term                | Meaning                                                                                                                            | _Avoid_                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| provider            | The vendor behind an integration: `google`, `microsoft`, `linkedin`.                                                               | vendor (in code), integration                              |
| integration         | One capability at a provider that RAGNA Studio can use: `gmail`, `outlook-mail`, `google-drive`. Defined in `INTEGRATION_CATALOG`. | connector (in code), provider                              |
| integration catalog | The list of integrations, `INTEGRATION_CATALOG` in `@repo/integrations/catalog`.                                                   | catalog (unqualified)                                      |
| connection          | A user's or workspace's linked external account at a provider, with its tokens. Table `integration_connections`.                   | account (that is better-auth's login account), integration |
| account             | A better-auth login method of a user (Google, Microsoft, Apple sign-in). Table `account`.                                          | connection                                                 |
| passkey             | A WebAuthn credential on a user's device that signs them in. A user can have several. Table `passkeys`.                            | security key, account                                      |
| social post         | A post a user or agent writes in RAGNA Studio and publishes to a social network. Draft, published or failed. Table `social_posts`. | post (unqualified), share                                  |

## Agents and AI

| Term             | Meaning                                                                                                                                  | _Avoid_                            |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| agent            | A configured assistant in a workspace: model, system prompt, context and tools.                                                          | assistant, bot                     |
| agent tool       | A capability an agent's editor switches on. One agent tool can give the model several AI SDK tools (`datasets` gives seven).             | tool (where AI SDK tools are near) |
| agent tool grant | One agent tool switched on for an agent, with its access level (`read` or `write`) when the tool has levels. Stored in `tool_grants`.    | integration tool, enabled tool     |
| agent mark       | An agent's small square sign: its icon on its tone, or its uploaded image. Without either, the robotic icon on a tone from the agent id. | avatar, logo                       |
| agent version    | An immutable snapshot of an agent's configuration, written when it is locked or approved. Numbered 1, 2, 3 per agent (`agent_versions`). | revision, snapshot                 |
| agent lock       | An agent users can't change: it points at its current agent version. Only the agent itself still writes its memory.                      | freeze, read-only                  |
| unattended run   | A run of an agent with nobody watching: task runs, later workflows. Needs an agent version approved for unattended runs.                 | background run, autonomous run     |
| AI SDK tool      | One function the model can call, an entry in the AI SDK `ToolSet`.                                                                       | agent tool                         |
| tool definition  | One AI SDK tool written once for every consumer: name, description, input schema, access and `execute` (`ToolDefinition`).               | tool spec, tool config             |
| tool failure     | An expected tool outcome returned to the model as `{ status, message }` (`ToolFailure`), such as not connected or too large.             | tool error (for returned outcomes) |
| AI model         | A row in `ai_models`: provider, model id and capabilities.                                                                               | model (where data models are near) |
| template         | A predefined agent a user can create an agent from (`agent_templates`).                                                                  | preset                             |

## Tasks and tones

| Term       | Meaning                                                                                                                    | _Avoid_                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| tone       | One of the eight identity colours (sea, sage, ochre, clay, dusk, plum, rose, stone) shared by agent marks and task labels. | colour (for the stored value), palette                 |
| task label | A workspace-wide category on tasks, shown as a tag with its tone's dot.                                                    | tag (for the domain object; `Tag` is only the UI chip) |

## Users and emails

| Term                | Meaning                                                                                                     | _Avoid_                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| language            | The language a user sees the app and gets emails in: `en` or `de`. `locale` in code, column `users.locale`. | lang, translation (for the setting)   |
| transactional email | An email RAGNA Studio sends on an event in the user's account: welcome, invitation, passkey added.          | notification (that is the in-app one) |
