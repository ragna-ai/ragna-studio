# <Feature>: <what changes, in a few words> (PRD)

> **Status: proposed** (YYYY-MM-DD). Issue #N.

<Two or three short paragraphs. What is wrong today, for whom, and what this PRD changes. The
first sentence is the point.>

## Problem

<Evidence: issues, user reports, numbers, the code path that breaks. Label a hunch as an
assumption.>

## Goals

- <Outcome, from the user's side.>
- **Success signal:** <one observable sign that it worked, or "n/a".>

## Non-goals

- <What this PRD deliberately doesn't do, and where it goes instead (later phase, issue #N).>

## User stories

Roles: <which qualified roles appear below>.

### US-1 <Short title> (P1)

As a <role>, I want <capability>, so that <benefit>.

- **US-1.1** Given <state before>, when <one event>, then <observable outcome>.
- **US-1.2** Given <state before>, when <one event>, then <observable outcome>.
- **US-1.3** Given <a denied role, invalid input or empty state>, when <event>, then <what the user
  sees or the API returns>.

### US-2 <Short title> (P2)

As a <role>, I want <capability>, so that <benefit>.

- **US-2.1** Given <state before>, when <one event>, then <observable outcome>.
- **US-2.2** Rule: <a constraint with no meaningful given or when>.

## Testing

| Criterion | Level            | Folder                  |
| --------- | ---------------- | ----------------------- |
| US-1.1    | API              | `apps/api/test/<area>/` |
| US-1.2    | API              | `apps/api/test/<area>/` |
| US-1.3    | e2e (Playwright) | `apps/web/e2e/`         |

## Standards checklist

See `specs/standards/README.md`. Answer each line or write "n/a".

- **Deletion:**
- **Retention:**
- **Erasure:**
- **Docs:** <the `apps/docs` page that changes, or "none exists yet">

## Decisions

<Only decisions that are hard to reverse, surprising without context and a real trade-off. One
short paragraph each: the decision, why, and the alternative that lost.>

## Open questions

- [NEEDS CLARIFICATION: <question>]

## Design

<Small features only: schema, API contracts, per-package changes. Move this to `design.md` once
`prd.md` passes about 150 lines.>
