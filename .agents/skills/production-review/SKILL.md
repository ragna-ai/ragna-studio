---
name: production-review
description: "Apply when asked to assess an existing implementation or feature as a whole (\"assess the agent tools\", \"review X from a senior SaaS perspective\", \"is X production-ready?\"). A senior engineer's review grounded in research: maps the implementation, checks fixed dimensions (correctness, tenancy, security, cost, observability, testability, extensibility, operability), compares with open-source projects, and ends with ranked findings and options for the developer to decide."
---

Review an implementation the way a senior engineer who has shipped many SaaS products to production would. Ground
every claim in the code, in current research, or in named experience. The review ends with findings and options;
the developer decides what to do.

**Related skills.** Load system-design and clean-code before judging. Add tdd for `apps/api`, integration-connector
for vendor connectors, dependency-choice when a package could replace custom code. After the developer decides,
continue with the issue-workflow skill.

## 1. Map before judging

Read the whole implementation first. Write down, briefly:

- entry points (routes, tools, jobs, crons, UI);
- data flow and the tables it reads and writes;
- workers, queues and external calls;
- existing specs in `specs/` and open issues (`gh issue list --search <topic>`);
- existing tests and what they cover.

Don't form findings until the map is complete. A finding against code you haven't read is a guess.

## 2. Research

- Search the web for current best practices on the problem, not just the library. Prefer primary sources: vendor
  docs, RFCs, engineering blogs of companies that run it at scale.
- Compare with two or three named open-source projects that solve the same problem. Read their actual code or
  docs, and note what they do differently and why.
- Check the versions this repo uses. Advice for an older or newer major version doesn't count.
- Cite every source with a link.

Do the research yourself. Fan out to research subagents only when the developer asks for it.

## 3. Review dimensions

Cover every dimension. If one doesn't apply, say so in one line.

| Dimension              | Questions                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| Correctness            | Edge cases, races, partial failure, ordering, idempotency of retries                            |
| Tenancy and security   | Workspace and organization scope on every read and write, input validation, secrets, SSRF, prompt injection where AI is involved |
| Cost and scale         | N+1 queries, unbounded lists, token and credit usage, hot paths, what breaks at 10x and 100x     |
| Observability          | Can an operator tell what happened and why? Logs, errors, metrics on the failure paths           |
| Testability            | What is tested, what isn't, what can't be tested in the current shape                           |
| Extensibility          | Known vs speculative variants (system-design). What does adding the next known variant touch?   |
| Operability            | Migrations, config and env vars, backfills, self-hosting, rollback                               |
| Code quality           | clean-code rules, naming per `specs/glossary.md`, dead code, wrapper layers                      |

## 4. Report

1. **Summary.** Three to five sentences: overall verdict and the biggest risk.
2. **Map.** The short map from step 1.
3. **Findings, ranked by severity** (blocker, high, medium, low). Each has: the claim, evidence as
   `file:line`, the source (research link or "experience"), and the impact in production.
4. **Keep.** What is good and should stay. A review that only lists problems invites needless rewrites.
5. **Options.** Two or three ways forward with trade-offs and a recommendation.
6. **Proposed follow-ups.** One line each, ready to become a GitHub issue. Don't file them until the developer
   agrees.

Stop here. Don't edit code, specs or issues until the developer picks an option.

## Security findings

This repo is public. An exploitable finding never goes into a public issue, PR, commit message or spec. Tell the
developer in the session only, and handle it through the process in `SECURITY.md`.
