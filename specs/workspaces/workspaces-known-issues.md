# Workspaces: known issues

See [workspaces.md](./workspaces.md) for the v1 design this refers to. That
design (optional `workspaceId`, "All items", "Unassigned") is superseded by
the container model in
[specs/api-standards/prd.md](../api-standards/prd.md).

## Agent-tool-created resources land unassigned (resolved)

Was a confirmed bug under the old optional-`workspaceId` model: resources
created by the chat agent's tools (e.g. `linkedinDraft`, which creates a
`socialPost`) could be inserted with `workspaceId: null`, so they didn't show
up in the workspace the user was actually working in.

The container model resolves this by construction: every chat has a
required `workspaceId`, agent tools run inside a chat and inherit it, and
every tool-created resource's `workspaceId` column is now `NOT NULL`. There
is no "unassigned" state left to fall into. See
[specs/api-standards/prd.md](../api-standards/prd.md) ("Side effects worth
noting") for the full design.
