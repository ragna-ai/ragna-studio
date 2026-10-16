---
name: docs-writing
description: Apply when writing or editing user-facing docs in apps/docs (docs.ragna.io). Voice, structure, naming, diagrams and how to verify a docs change. Use for any new or changed .mdx page.
---

Docs are read by users, workspace owners, operators and people evaluating RAGNA Studio. Write for all of them. `apps/docs/AGENT.md` covers the Nimbus mechanics (frontmatter, components, CLI). This skill covers the writing.

## Voice

1. **Neutral perspective.** Describe the product from the outside: "the user", "each user", "the app". Don't address the reader as "you" in descriptive prose. "Nothing is shared until the user turns it on", not "Nothing is shared until you turn it on".
2. **Steps stay imperative.** Numbered how-to steps are commands: "Open the user menu and choose **MCP**." No "you" needed.
3. **Short sentences.** One idea each. Split chained clauses.
4. **No em-dashes (`—`).** Use commas, colons, parentheses or two sentences.
5. **Brand:** `RAGNA` and `RAGNA Studio` in prose. Lowercase only in URLs, package names and paths.
6. **UI labels in bold, verbatim.** Copy them from `apps/web/i18n/locales/en-UK.json`, even where the UI string still says "Ragna". The reader must find the exact text on screen.

## Naming

1. **Generic over vendor.** Name the category, not one product: "AI app (MCP client)", not "Claude Desktop". A vendor name alone makes a feature look limited to that vendor. Name the vendor as an example ("such as Claude Desktop") or in a section that really is vendor-specific (its own connect steps).
2. **Generic over the current instance.** When a feature works on a type of thing (resource types, providers, integrations), describe it in terms of that type. List the supported instances in a table so a new one is one new row, not a rewrite of every paragraph.

```mdx
## Supported resources

| Resource | Read                               | Read & write                                  |
| -------- | ---------------------------------- | --------------------------------------------- |
| Datasets | Find datasets and read their rows. | Create datasets, and add, edit and move rows. |
```

## Content

1. **Verify every claim against the code.** Defaults, limits, who can do what. Read the config schema, service or i18n string before writing it down. A plausible default is often wrong (`MCP_ALLOWED_CLIENT_IDS` defaults to empty, not to Claude).
2. **Explain access and trust.** For anything that grants access (connections, sharing, tokens), say who can grant it, what it is limited to, and how to revoke it. Revocation gets its own explicit statement and a link to the section with the steps.
3. **Security model in user terms.** State guarantees ("Nobody can connect an app to someone else's account"), then the reason in one sentence. No library or RFC names in user docs. Those belong in `specs/`.
4. **Operators get a line in `self-hosting/security.mdx`** when a feature adds a switch or allowlist that affects security. Link to the feature page instead of repeating it.
5. **Security fixes wait.** Docs describing a security fix are published only after its advisory is public.

## Diagrams

Mermaid renders in the browser (Nimbus `mermaid` recipe, `src/scripts/mermaid.ts`). Use the explicit form. Plain ` ```mermaid ` fences are not transformed and show as code.

```mdx
<pre class="mermaid">{`
sequenceDiagram
  actor User
  participant App as AI app (MCP client)
  App->>User: ...
`}</pre>
```

- Use a diagram for flows with several parties or steps (auth, approvals, pipelines). Not for a single action.
- Same voice and naming rules inside the diagram: "User", generic participant names, short labels.
- Show the end of the lifecycle too (revoke, delete, expiry), not only the happy path.
- In `specs/`, plain ` ```mermaid ` fences are fine (GitHub renders them).

## Verify

Run from the repo root:

```bash
pnpm exec oxfmt apps/docs/src/content/docs/<path>.mdx
pnpm --filter @repo/docs build                       # astro check + build, must end with "Complete!"
(cd apps/docs && npx @cloudflare/nimbus-docs check)  # links + frontmatter
```

Then report what changed per page. Mention anything left out on purpose (vendor-specific steps, sections that stay specific).
