---
name: dependency-choice
description: Apply before adding any npm dependency, and before building a bigger feature or abstraction (a vendor SDK, sync engine, file parser, HTTP layer, editor plugin) that an open-source package might already solve. License, maintenance, runtime, footprint and security checks, how to wrap the package, and how to record the decision.
---

Before writing a bigger feature or abstraction yourself, check for a maintained open-source package. Present it as one candidate next to building it. Building it yourself is a valid outcome, but say why.

**Context for newcomers.** The repo is open source under AGPL-3.0 and is also sold under a commercial license (dual licensing). It is a pnpm monorepo: each app or package declares its own dependencies. Dependency updates are automated, and pnpm only installs versions that have been published for at least 3 days (`minimumReleaseAge` in `pnpm-workspace.yaml`). The house stack is TypeScript (ESM), zod for validation, native `fetch` for HTTP, and `bun test` for API tests. Feature decisions are recorded in `specs/<feature>/design.md`.

## Checks, all of them

1. **License.** Permissive only: MIT, Apache-2.0, BSD, ISC. GPL, AGPL, SSPL, Elastic and other source-available licenses would block the commercial license. Check the transitive dependencies too.
2. **Maintained.** Releases in recent months, issues and PRs get answers, more than one maintainer or a company behind it. Archived, deprecated, or a sole maintainer gone quiet is a no.
3. **Runtime fit.** ESM, bundled TypeScript types, runs on Node and under `bun test`. For the web app: works in the browser and has a reasonable bundle size.
4. **Footprint.** Count what it pulls in. Avoid native builds (they need an explicit `allowBuilds` entry in `pnpm-workspace.yaml`). A small package with fifty transitive dependencies loses against fifty lines of our own code.
5. **Security record.** Past advisories and how fast they were fixed. Because of the 3-day release cooldown, a package that often needs same-day upgrades is a poor fit.
6. **Fits the house stack.** Works with zod, `fetch` and our error handling. It must not bring a second HTTP client, validation library or dependency-injection container.
7. **Scope match.** It solves our problem, not a much bigger one. Adopting a framework to use one function is a no.

Show the results to the user as a short table (package, license, last release, weekly downloads, transitive dependencies, verdict) before adding anything.

## When adopting

- **Wrap it behind our own contract.** The package is imported in one adapter only, never in callers or in contract types. Replacing it later touches only that adapter.
- **Add it where it's used.** Declare the dependency in the one app or package that wraps it, not at the workspace root.
- **Record the choice** in the feature's design doc: what was picked, what was rejected, and why.

## When not to add one

- **One-off scripts.** Backfills and data migrations use only what their app already depends on. No new dependency, not even a dev dependency.
- **A few lines of code.** If the needed part is small and stable, write it.
- **Something the repo already covers.** Check the existing workspace packages and the shared version catalog in `pnpm-workspace.yaml` first.
