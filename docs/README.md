# Docs

PRDs and design docs for ragna-studio, one folder per feature area.

## Status convention

Every PRD/design doc that tracks a build carries a `Status: ...` line right
under its H1 (plain or bold, blockquote or not — the generator handles
either). The line must lead with one of these six values:

| Status        | Meaning                                             |
| ------------- | ---------------------------------------------------- |
| `proposed`    | Written up, not yet agreed.                          |
| `decided`     | Design agreed, not built yet.                        |
| `in-progress` | Actively being built.                                |
| `implemented` | Shipped, merged to main.                             |
| `deferred`    | Decided not to build now; no active plan.            |
| `superseded`  | Replaced by a newer doc (link to it).                |

Free text after the status word is fine (date, PR #, deviations, what's
left) — the generator keeps only the first sentence for the index.

Reference material without a build lifecycle (known-issues logs, strategy
notes that aren't PRDs, reviews, checklists) doesn't need a Status line;
`docs:index` only picks up docs that have one.

Run `pnpm docs:index` after adding or changing a Status line to regenerate
[INDEX.md](./INDEX.md).

## Product overview

[overview.md](./overview.md) is a hand-curated map of the product surface,
grouped by feature area, for fast context-loading rather than build
tracking. When a PRD's Status flips to `implemented`, add or update its
entry there too.
