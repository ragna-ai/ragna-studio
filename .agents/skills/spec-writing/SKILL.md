---
name: spec-writing
description: Apply when writing or editing a PRD, design doc or slices doc in specs/. User stories, Given/When/Then acceptance criteria, PRD structure, length budget and when to record a decision. Use for any new or changed spec.
---

A spec answers what to build and how we know it is done. Write it for two readers: the person who decides and the agent that builds it. Start every new PRD from [prd-template.md](./prd-template.md).

`specs/README.md` owns the Status vocabulary and `pnpm specs:index`. `specs/standards/README.md` owns the checklist every PRD answers. AGENTS.md owns the bookkeeping that ships with the code (Status, `Closes #N`, `overview.md`, `apps/docs`). This skill covers the writing.

## One feature, up to three files

| File         | Holds                                                            | Rule                                              |
| ------------ | ---------------------------------------------------------------- | ------------------------------------------------- |
| `prd.md`     | Problem, scope, user stories, acceptance criteria, testing table | What and why only. No schema, routes or packages. |
| `design.md`  | Schema, API contracts, sequence, per-package changes             | How. Links back to story IDs.                     |
| `slices.md`  | Build plan for parallel agents: slices, owned paths, contracts   | Each slice names the criteria it delivers.        |

A small feature keeps the design as one `## Design` section at the end of `prd.md`. Split it out once it passes the length budget.

## Length budget

- `prd.md` stays under about 150 lines. Past that, split by phase: specify phase 1 in full, outline later phases, give each its own PRD.
- One page per idea. If a section needs a scroll, it is probably design, not requirements.

## User stories

Use the agile format: a story, then its acceptance criteria.

```markdown
### US-1 Allowed integrations (P1)

As an organization owner, I want to choose which integrations my organization may use, so that
users only connect what the company has approved.
```

1. **"As a [role], I want [capability], so that [benefit]."** The "so that" is required. A story with no clear benefit gets cut.
2. **Qualified role names.** Platform admin, organization owner or admin, workspace manager or editor. Never a bare "admin" or "member". "User" means any signed-in user.
3. **ID and priority.** `US-1`, `US-2` in order. P1 is the smallest slice worth shipping. P2 and P3 can follow later.
4. **INVEST.** Each story is independent, negotiable, valuable, estimable, small and testable. A story that needs another story's code first is a slice of that story, not its own.
5. **Split by behavior, not by layer.** "Admin can disable an integration" is a story. "Add the database column" is a task in `slices.md`.

## Acceptance criteria

Every story has acceptance criteria. They are the story's definition of done, and each one becomes at least one test.

```markdown
- **US-1.1** Given an organization owner on the organization settings page, when they turn off
  an integration, then its connect button is hidden for every user in the organization.
- **US-1.2** Given a workspace editor, when they try to change an integration switch, then the
  request is rejected with `403`.
- **US-1.3** Given a disabled integration with an active mailbox, when sync runs, then it pauses
  and the user sees "Disabled by your organization".
```

1. **Given / When / Then.** Given = the state before (who, what exists). When = one event or action. Then = the observable outcome. Join extra givens or outcomes with "and".
2. **One behavior per criterion.** Two "when"s means two criteria.
3. **Observable outcomes only.** What the user sees, what the API returns, what arrives in the mailbox. Not database rows or internal calls.
4. **Declarative, not UI mechanics.** "When they turn off an integration", not "when they click the third toggle". Ask: would this sentence change if the UI changed? Then rewrite it.
5. **Intent, not solution.** No table names, libraries or component names. Those go in `design.md`.
6. **Cover the unhappy paths.** Every story with input or permissions has at least one criterion for an error, a denied role or an empty state.
7. **Short.** 2 to 5 criteria per story. More than 5 usually means the story should be split.
8. **IDs are `US-<story>.<n>`.** Never renumber after the PRD is `decided`. Add new ones at the end.
9. **A pure constraint can be a rule.** When there is no meaningful "given" or "when" (a limit, a format), write it as one sentence: `**US-2.3** Rule: a name is 1 to 120 characters.`

## Testing table

The PRD maps each criterion to where its test lives. This is the input for the tdd skill.

```markdown
| Criterion | Level            | Folder                   |
| --------- | ---------------- | ------------------------ |
| US-1.1    | e2e (Playwright) | `apps/web/e2e/`          |
| US-1.2    | API              | `apps/api/test/<area>/`  |
| US-1.3    | worker           | `apps/worker/test/<area>/` |
```

Default to the API level (`app.request()`). Use e2e only for a journey that needs the browser.

## Unknowns

Mark an open point in place as `[NEEDS CLARIFICATION: question]`. At most 3 per PRD. More means it is not ready to be written yet: discuss first. A PRD can't move to `decided` while one is left.

## Decisions

Record a decision in the PRD's `## Decisions` section only when all three are true:

1. **Hard to reverse.** Changing it later costs real work.
2. **Surprising without context.** A future reader would ask "why on earth this way?"
3. **A real trade-off.** There were genuine alternatives.

One short paragraph each: the decision, why, and the alternative that lost. Easy-to-reverse or obvious choices don't get an entry.

## Slices

`slices.md` holds only what is specific to this build: slices, owned paths, contracts, which slice runs tests, and the criteria each slice delivers. Don't copy repo rules into it. Point to them instead: "Every slice follows AGENTS.md and loads the clean-code skill (plus tdd for `apps/api`)."

## Public repo

- No business strategy, pricing or undecided drafts in `specs/`. They live outside this repo.
- Exploitable security findings never go into a spec before their advisory is published. Security-relevant criteria use neutral words: the input's shape or size, not "attack" or "malicious".

## Voice

Short sentences, one idea each. No em-dashes. `RAGNA` and `RAGNA Studio` in prose.

## Before finishing

- Does every story have a "so that" and 2 to 5 criteria, at least one of them an unhappy path?
- Is every criterion Given/When/Then (or a one-line rule), observable and free of implementation names?
- Does every criterion appear in the testing table?
- Is `prd.md` under about 150 lines, with schema and API in `design.md` or a `## Design` section?
- Are the standards checklist and the Status line filled in?

## Sources

- [Introducing BDD](https://dannorth.net/blog/introducing-bdd/), Dan North: story template and Given/When/Then scenarios as acceptance criteria.
- [INVEST](https://www.agilealliance.org/glossary/invest/), Agile Alliance (Bill Wake, 2003).
- [Card, Conversation, Confirmation](https://ronjeffries.com/xprog/articles/expcardconversationconfirmation/), Ron Jeffries.
- [User stories](https://www.mountaingoatsoftware.com/agile/user-stories), Mike Cohn: splitting and acceptance criteria.
- [Gherkin reference](https://cucumber.io/docs/gherkin/reference/) and [Writing better Gherkin](https://cucumber.io/docs/bdd/better-gherkin/), Cucumber: 3 to 5 steps, observable outcomes, declarative style.
- [Acceptance criteria](https://www.altexsoft.com/blog/acceptance-criteria-purposes-formats-and-best-practices/), AltexSoft: scenario versus rule format, intent not solution.
