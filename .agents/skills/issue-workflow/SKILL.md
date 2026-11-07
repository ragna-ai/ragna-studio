---
name: issue-workflow
description: "Apply when the developer points at a GitHub issue or feature (\"let's discuss #123\", \"pick up this issue\") or asks to hand implementation to worker agents (\"kick off agents\", \"you're team lead\"). The end-to-end loop for this repo: assess with the right skills loaded, present options, PRD and approval gate, delegate to worker agents, integration pass, hand-over and bookkeeping."
---

The usual loop from issue to merged PR. The developer decides, the lead agent (the coding agent the developer
talks to) plans and integrates, worker agents implement. "Agent" here means a coding agent, not the product's
agents.

## 1. Pick up the issue

- Read it: `gh issue view <N> --comments`. Follow links to its parent, sub-issues, PRD and related PRs.
- Read the PRD or design doc in `specs/` if one exists, and the terms in `specs/glossary.md`.

## 2. Load skills before forming an opinion

Load every skill that applies **before** the first recommendation, not after. A skill loaded later acts as a
late review and can overturn the advice.

| Work involves                                      | Load                                |
| -------------------------------------------------- | ----------------------------------- |
| Any code                                           | clean-code                          |
| Variants, a shared client, a registry, a new seam  | system-design                       |
| A vendor account (drive, mailbox, calendar, ...)   | system-design, integration-connector |
| `apps/api` or a package it reaches                 | tdd                                 |
| A new npm package, or a feature a package may solve | dependency-choice                  |
| A PRD, design doc or slices doc                    | spec-writing                        |
| A page in `apps/docs`                              | docs-writing                        |

If unsure whether a skill applies, load it. Say which skills you loaded.

## 3. Assess and present options

- Investigate with your own tools. Don't spawn agents for the assessment.
- Present two or three options with honest trade-offs and a recommendation. Use the question tool when the
  choice is clear-cut.
- A question from the developer ("could we use X?") is not a decision. Don't edit a PRD or code until they pick.

## 4. Branch, PRD, draft PR

- New branch from `origin/main`. If the checkout is dirty or another agent works in it, use a worktree
  (see AGENTS.md).
- **Feature or non-trivial change:** write or update the PRD with the spec-writing skill. It is the first
  commit of a draft PR (`gh pr create --draft`) whose body says `Closes #<N>`.
- **Small fix:** a short plan in chat replaces the PRD.

## 5. Approval gate

Wait for explicit approval of the PRD or plan. Answers to design questions in chat are input to the PRD, not
approval to build.

## 6. Implement

- Small, single-area work: implement it yourself.
- Larger or parallel work: the lead delegates. Spawn worker agents on a cheaper model; in Claude Code that is
  `general-purpose` with `model: "sonnet"`, set explicitly on every call.
- Split into slices that touch separate files. Parallel only when slices are independent.
- **De-risk before dispatching.** Read the key files of each slice yourself. Put landmines you found into the
  brief as "already verified, don't rediscover".
- **Every brief contains:** goal and the PRD section, files to touch, the skills to load, one or two existing
  files as house style, the tests to write and run, `pnpm check-types` before reporting done, and "don't
  commit".
- Reuse an idle worker for follow-ups in its area. If the design shifts mid-flight, tell the worker which
  earlier instructions are superseded.

## 7. Integration pass

The lead's real work, not a formality.

- Check the result on disk. Read each worker's self-flagged notes and open points: the bugs hide there, not in
  green test output.
- Run the tests of every touched area and `pnpm check-types` once after all workers finish. Cross-slice bugs
  (missing re-exports, mismatched shapes) only show up here.
- Run `pnpm format` and `pnpm lint`.

## 8. Hand over

- Summarise what changed, what was verified and what was not. Report failures with their output.
- The developer verifies. Commit and push only when asked, and ask again for every commit.
- Before pushing more commits to an existing PR, check it isn't merged: `gh pr view <N> --json state`.

## 9. Bookkeeping in the same PR

PRD `Status: implemented (<date>, PR #<N>)`, `pnpm specs:index`, the `specs/overview.md` entry and the
`apps/docs` page. Details in AGENTS.md under "Design docs".

## 10. Close out

- Stop workers once the developer confirms the work. A "please shut down" message is not enough; stop the
  task (Claude Code: `TaskStop`) and check the agent list.
- File follow-ups as GitHub issues (sub-issues with `--parent <N>` where they belong), never as notes in
  `specs/`.
