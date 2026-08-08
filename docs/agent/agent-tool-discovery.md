# Agent tool discovery (`findTool`)

**Status: deferred.** Deliberately not built; no activation trigger below has fired yet. Build when one does, not before.

Related: [datasets.md](./datasets.md) (the soft-pin design that keeps hot paths discovery-free), `packages/ai/src/tools/agent.tools.ts` (the toolset seam this slots into).

## Problem

Every enabled tool costs its definition in every request, whether used or not, and tool-choice accuracy degrades as the catalog grows: the model's attention spreads across more options. Today this is a non-problem: the catalog is 11 tools behind 7 toggles, a few hundred tokens, and an agent benefits from seeing its whole capability surface. But catalogs grow in jumps, not increments (one MCP server can add 30+ tools at once), and past a few dozen tools the fixed cost flips the economics.

Tool discovery converts the fixed cost into a per-use cost: agents get a small eager core plus one `findTool` meta-tool that searches a catalog of deferred tools (name + description only, no schemas in context) and activates matches for the rest of the run.

## Why not now (recorded so it doesn't get rebuilt prematurely)

- At 11 tools, discovery is pure overhead: an extra step per capability use against tight step budgets (5 chat / 15 workflow), and a new failure mode (a bad search concludes a capability doesn't exist).
- The soft-pin design (datasets.md decision 10) already removes the main future pain: pinned context is injected up front, so an agent's hot path would stay discovery-free even in a findTool world.
- Decided 2026-07-17 in discussion: right idea, wrong scale.

## Activation triggers

Build this when any of the following happens:

1. **MCP support lands.** Connecting external MCP servers is the classic catalog explosion and the strongest trigger.
2. **The native catalog passes ~25 tools.** Plausible path: Gmail tools (send/search, from the email-trigger roadmap), calendar, more dataset operations.
3. **Observed tool-choice degradation**: agents calling wrong tools or ignoring available ones as the catalog grows, even below the numeric threshold.

## Design (proposed)

1. **Two-tier catalog.** Each toolset entry in the registry (`agent.tools.ts`) gains a tier: `eager` (definition always included; today's behavior) or `deferred` (only name + one-line description live in the catalog; the schema and implementation load on activation). Core tools (think, memory, the pinned dataset family) stay eager; long-tail integrations go deferred.

2. **One `findTool` meta-tool**, included automatically whenever an agent has at least one deferred tool. Input: a keyword query. Output: matching deferred tools (name, description) plus activation. Matching is simple substring/keyword over name + description; no embeddings until proven insufficient.

3. **Activation via the AI SDK loop.** App-level, provider-agnostic: activated tool names accumulate in per-run state, and `prepareStep` rebuilds the tools record each step as eager set + activated set + `findTool`. This is an assembly-policy change inside `buildAgentToolset`'s seam, not an architectural rework. **Rejected for now:** Anthropic's native tool-search beta (`defer_loading`); it only covers the Anthropic provider, and agents here run on OpenAI/Google models too. Revisit if the app ever goes Anthropic-only.

4. **Activation scope: the current run.** A discovered tool stays active for the rest of the chat response or workflow node execution, then resets. No per-conversation persistence in v1; a capability the agent needs every run should be eager (or pinned) instead.

5. **Step budget exemption.** A `findTool` call must not eat the working budget: either exempt it from `stopWhen` counting (custom `stopWhen` predicate) or raise caps by the expected discovery overhead. Decide at build time; exemption is cleaner.

6. **Workflows stay eager in v1.** Unattended runs are the worst place for a discovery miss, and workflow agents are purpose-built with few tools. Discovery ships chat-first; workflow adoption is a follow-up once trust is established.

## Out of scope

- MCP integration itself (separate feature; this PRD only defines how its tools would be absorbed).
- A tool marketplace or per-user custom tools.
- Embedding-based tool search.
- UI changes beyond the agent tool list marking deferred capabilities.

## Open questions (answer at build time)

1. Does `findTool` activate matches automatically, or return candidates and require the model to request activation? Proposed: activate automatically, top 3 matches max.
2. Per-agent opt-out (an agent whose tools should all be eager regardless of catalog size)? Proposed: yes, trivial flag.
3. Telemetry: log discovery queries and misses to tune descriptions? Proposed: yes, log-level only.
