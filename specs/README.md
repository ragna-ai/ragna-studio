# Specs

PRDs and design docs for ragna-studio, one folder per feature area.

## Layout

New specs get one folder per GitHub issue inside their area:

```text
specs/<area>/<issue>-<slug>/prd.md       requirements: stories, acceptance criteria, testing
specs/<area>/<issue>-<slug>/design.md    schema, API, per-package changes (optional)
specs/<area>/<issue>-<slug>/slices.md    build plan for parallel agents (optional)
specs/<area>/reference/                  known issues, reviews, notes without a Status line
```

Example: `integrations/224-connections/prd.md` for issue #224. Follow-ups
(version 2, change requests, later phases) get a new issue and a new folder. Specs written before
2026-10-29 keep their old paths.

## Writing a spec

Start a new PRD from the template in the spec-writing skill
([`.agents/skills/spec-writing/`](../.agents/skills/spec-writing/SKILL.md)). It covers the layout
above, user stories, Given/When/Then acceptance criteria, the testing table, the length budget and
when to record a decision. The research behind it is in
[spec-writing/reference/assessment-2026-10-29.md](./spec-writing/reference/assessment-2026-10-29.md).

## Status convention

Every PRD/design doc that tracks a build carries a `Status: ...` line right
under its H1 (plain or bold, blockquote or not — the generator handles
either). The line must lead with one of these six values:

| Status        | Meaning                                   |
| ------------- | ----------------------------------------- |
| `proposed`    | Written up, not yet agreed.               |
| `decided`     | Design agreed, not built yet.             |
| `in-progress` | Actively being built.                     |
| `implemented` | Shipped, merged to main.                  |
| `deferred`    | Decided not to build now; no active plan. |
| `superseded`  | Replaced by a newer doc (link to it).     |

Free text after the status word is fine (date, PR #, deviations, what's
left) — the generator keeps only the first sentence for the index.

Reference material without a build lifecycle (known-issues logs, strategy
notes that aren't PRDs, reviews, checklists) doesn't need a Status line;
`specs:index` only picks up docs that have one.

Run `pnpm specs:index` after adding or changing a Status line to regenerate
[INDEX.md](./INDEX.md).

## Product overview

[overview.md](./overview.md) is a hand-curated map of the product surface,
grouped by feature area, for fast context-loading rather than build
tracking. When a PRD's Status flips to `implemented`, add or update its
entry there too.
