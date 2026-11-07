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

## Agents and AI

| Term             | Meaning                                                                                                                               | _Avoid_                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| agent            | A configured assistant in a workspace: model, system prompt, context and tools.                                                       | assistant, bot                     |
| agent tool       | A capability an agent's editor switches on. One agent tool can give the model several AI SDK tools (`datasets` gives seven).          | tool (where AI SDK tools are near) |
| agent tool grant | One agent tool switched on for an agent, with its access level (`read` or `write`) when the tool has levels. Stored in `tool_grants`. | integration tool, enabled tool     |
| AI SDK tool      | One function the model can call, an entry in the AI SDK `ToolSet`.                                                                    | agent tool                         |
| AI model         | A row in `ai_models`: provider, model id and capabilities.                                                                            | model (where data models are near) |
| template         | A predefined agent a user can create an agent from (`agent_templates`).                                                               | preset                             |
