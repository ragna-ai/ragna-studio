# Standards

Reference doc, not a PRD: no `Status:` line (see [../README.md](../README.md)).

Repo-wide rules that every feature follows, one folder per standard. A feature PRD doesn't
re-decide them. It answers the checklist below and links the standard.

## Index

| Standard                                                  | Covers                                                    | Status             |
| --------------------------------------------------------- | --------------------------------------------------------- | ------------------ |
| [Deletion and retention](./deletion-and-retention/prd.md) | Hard delete, trash, `deleted_record`, purge, GDPR erasure | proposed           |
| [Workspace container model](../api-standards/prd.md)      | Routes, scope, access boundary                            | implemented        |
| [Resource guard](../api-standards/resource-guard.md)      | Scope checks at repository writes                         | implemented        |
| Audit log                                                 | Actor, tenant, action, target, before/after               | not written (#171) |
| API errors                                                | RFC 9457 `application/problem+json`                       | not written (#172) |
| Pagination                                                | Cursor pagination for growing lists                       | not written (#173) |
| Idempotency                                               | `Idempotency-Key` on state-changing POSTs                 | not written (#174) |
| Rate limiting                                             | Per user and per tenant, `429` + `Retry-After`            | not written (#175) |

Order of work: deletion and retention, audit log, API errors and pagination, idempotency and
rate limiting.

## How a standard is enforced

A rule only in prose drifts. Every standard names at least one enforcement in code: a helper in
a shared package, a type that rejects the wrong call, or a test that fails. The standard's doc
lists them.

## Checklist for every feature PRD

Answer each line in the PRD, or write "n/a".

- **Deletion**: hard delete or trash? Which tables go into `deleted_record`? Side effects to stop
  (schedules, jobs, R2 objects)?
- **Retention**: does the feature store data that must expire (logs, derived data, caches)?
- **Erasure**: is personal data reached by user and organization purge?
