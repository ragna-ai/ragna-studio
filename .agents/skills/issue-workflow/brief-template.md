# Brief template for a repo-worker

Copy it, fill every section, delete the hints. Keep it short: point to files instead of pasting them. The worker
already follows AGENTS.md and `.claude/agents/repo-worker.md`, so don't repeat their rules.

```markdown
## Goal
<One or two sentences: what this slice delivers.> Issue #<N>, PRD `specs/<area>/<issue>-<slug>/prd.md`
section <name>, criteria <US-1.1, US-1.2>.

## Why and what is decided
<The intent behind the slice, and decisions already made that the worker must not reopen.>

## Where you work
Branch `<branch>` in `<absolute path of the checkout>`. Stay there.

## Files
- You own: <files or folders>.
- Don't touch: <files other slices own>.
- House style: <one or two existing files to copy>.

## Already verified, don't rediscover
<Landmines the lead found while de-risking: gotchas, exact function names, shapes.>

## Shared resources
<"You own db:push / the rebuild of @repo/<pkg> / the e2e run." or "You own none: don't run them.">

## Skills
<The worker loads clean-code itself. Add tdd, system-design, ... and package skills by path.>

## Done when
- Tests: <which tests to write, and the exact command to run them>.
- `pnpm check-types` is green.
- Stop there. Don't extend the scope.

## Report
Files changed, checks run with results, open points and anything skipped (see the repo-worker definition).
```
