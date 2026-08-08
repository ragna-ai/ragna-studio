# Workflows: human in the loop (approval node)

**Status: proposed.** Under review, not yet built.

Companion to [README.md](./README.md) (architecture overview) and [workflows-implementation.md](./workflows-implementation.md) (v1 contracts). This resolves the `human-approval` placeholder from workflows.md and puts the reserved `suspended` run status to use.

## Problem

Workflow runs currently execute start to finish with no way for a person to intervene. That is acceptable while the tool catalog is a placeholder and runs only produce text. It becomes a blocker the moment a node has side effects: sending an email, publishing a social post, writing to an external system. Scheduled runs sharpen the problem, since nobody is watching when they execute.

## Use cases

1. **Gate before a side effect.** Agent drafts content, human approves or edits, tool publishes. The primary case. HIL should ship with, or just before, the first real side-effect tool.
2. **Quality gate on unattended runs.** A scheduled run pauses until a person has signed off on the generated output.
3. **Exception escalation.** A condition node routes only low-confidence or sensitive cases to an approval; everything else runs straight through.
4. **Audit trail.** Who approved what, and when, recorded per run.

Out of scope for v1 (deliberately):

- Human as a data source mid-run (free-form input requests). The schema leaves room for it, but v1 is approve/reject only.
- Approval timeouts and auto-expiry. Suspended runs wait indefinitely; they are visible in the runs list and cancellable.
- Email notifications for pending approvals. In-app notifications only, matching the existing run notifications.
- Multi-approver rules (quorum, roles). V1: the workflow owner resolves.

## User experience

**Builder:** a new "Approval" node in the palette. Config: a short message shown to the approver (template, `{{input}}` supported). Like the condition node it has two outgoing handles, `true` (approved) and `false` (rejected). The rejected handle may be left unconnected.

**Approver:** when a run reaches an approval node, the run suspends and the owner gets an in-app notification ("Workflow X is waiting for approval") that deep-links to the run view. The run view highlights the waiting step and shows the rendered message, the content under review (the node's input), an editable text area pre-filled with that content, an optional comment field, and Approve / Reject buttons. Approving with edits sends the edited text downstream. After resolving, the run view resumes polling and plays the rest of the run as usual.

**Runs list:** suspended runs show the existing `suspended` badge. A dedicated "pending approvals" inbox is a later increment.

## Design decisions (proposed)

1. **New node type `approval`.** Config schema: `{ message: string }` (template). Added to `NODE_TYPES`, the definition schema union, and the palette. Validation change: `sourceHandle: 'true' | 'false'` becomes legal on edges leaving approval nodes, not just condition nodes.

2. **Suspension is a clean job exit, not an error.** The approval executor checks the step for a stored resolution. Without one, it returns a `waiting` sentinel instead of a result. The engine then: writes the step with new step status `waiting` (storing the rendered message and the node input), keeps walking so parallel branches finish their ready work, and finally sets the run to `suspended` and returns normally. No throw, so no BullMQ retry is consumed and the processor's failure path stays untouched. The engine's deadlock guard must not fire when unresolved nodes remain because of a `waiting` step.

3. **Resolution lives on the step row.** New jsonb column `resolution` on `workflow_run_steps`: `{ decision: 'approved' | 'rejected'; comment?: string; editedOutput?: string; resolvedBy: string; resolvedAt: string }`. One step has at most one resolution, so no extra table. New step status `waiting` joins the enum.

4. **Resume = re-enqueue the existing run job.** `POST /workflow/run/:runId/step/:nodeId/resolve` with body `{ decision, comment?, editedOutput? }`. It validates the run is `suspended` and the step `waiting`, writes the resolution, sets the step back to `pending`, and enqueues a fresh `WorkflowRunJobDto` (`attempts: 3`). The run status stays `suspended` until the engine picks the job up and marks it `running`; no intermediate `pending` flip. The engine's idempotent-resume behavior does the rest: completed steps are reused, the approval node now finds its resolution and completes instantly.

5. **Branching mirrors the condition node.** The approval node's own output is the branch token: `'approved'` maps to `'true'`, `'rejected'` to `'false'`. Edge delivery works unchanged via `sourceHandle`. For chaining, approval nodes are looked through like condition nodes, with one addition: when the resolution has `editedOutput`, the look-through returns that instead of the upstream outputs. The comment is audit-only and does not flow downstream. A rejection with no `false` edge simply skips the downstream branch and the run completes, consistent with condition semantics.

6. **Parallel approvals need no special handling.** Each resolve re-runs the engine; it re-suspends if another approval is still waiting. The run completes once all are resolved.

7. **New notification type `workflow_run_awaiting_approval`** in the `NotificationDataMap`, payload `{ workflowId, runId, workflowName }`, enqueued by the engine when it suspends the run (once per newly waiting step). Existing succeeded/failed notifications are unchanged; the processor's `notifyRunFinished` already ignores `suspended`.

8. **Cancel covers suspended runs.** The cancel endpoint currently allows `pending`/`running`; it additionally accepts `suspended`. This is the escape hatch that makes "no timeouts in v1" acceptable.

9. **Sweeper and overlap interactions.**
   - The stale-run sweeper never sees suspended runs (it only sweeps `pending`/`running`), so suspension itself is safe. The problem is the moment *after* resume: the run is `running` again, but `started_at` still dates from before the suspension. The sweeper cannot distinguish a freshly resumed run from a genuinely stuck one; both look like "running with an old `started_at`", so a run approved days after suspending would be marked `failed` within one sweep cycle. `startedAt` keeps its meaning (when the run first started). Instead, two new nullable timestamps on `workflow_runs` record the HIL lifecycle: `suspended_at` (set when the run suspends) and `resumed_at` (set on each `suspended` to `running` transition, overwritten on repeated suspends). The sweeper's running rule then checks `coalesce(resumed_at, started_at)` older than 2h. The pair also gives the UI the approval timeline: how long a run waited, and when it picked back up.
   - The schedule overlap guard (`hasActiveRun`) starts treating `suspended` as active. Otherwise an unattended schedule piles up a new pending approval every tick. The cost: a forgotten suspended run blocks its schedule until resolved or cancelled. The awaiting-approval notification and the runs list make that visible.

10. **Authorization: owner only.** The resolve endpoint uses the same ownership check as the other run endpoints. Workspace-member approvals come later with proper roles.

## Changes by package

| Area | Change |
| --- | --- |
| `@repo/workflow` | `approval` node type + config schema, `waiting` step status, `WorkflowStepResolution` type, validation update for approval `sourceHandle` |
| `@repo/database` | `resolution` jsonb on `workflow_run_steps`, `suspended_at` / `resumed_at` timestamps on `workflow_runs` (db:push), repo functions: `resolveRunStep`, waiting-step lookups; `hasActiveRun` includes `suspended` |
| `@repo/queue` | `workflow_run_awaiting_approval` in `NotificationDataMap` |
| `apps/worker` | Approval executor, engine: waiting sentinel handling, suspend transition (sets `suspendedAt`), resume transition (sets `resumedAt`), suspend-aware deadlock guard, awaiting-approval notification; sweeper checks `coalesce(resumed_at, started_at)` |
| `apps/api` | Resolve endpoint, cancel accepts `suspended` |
| `apps/web` | Palette entry + config form, run view approval panel (message, editable content, comment, approve/reject), polling resumes after resolve, notification parser entry, i18n (`de-DE`, `en-UK`) |

## Open questions for review

1. **Editable payload in v1?** Decision 5 includes `editedOutput`. Dropping it makes v1 smaller (plain approve/reject), but "fix the draft, then send" is the strongest use case. Proposal: keep it.
2. **Reject without a false branch: complete or cancel?** Proposed: run completes (condition semantics), with the rejection visible on the step. Alternative: mark the run `cancelled` to make rejection feel terminal. Proposal: complete.
3. **Schedule blocking (decision 9b): skip ticks while suspended, or let runs pile up?** Proposed: skip. Reconsider when timeouts land.
4. **Node naming:** `approval` vs `human`. Proposed: `approval`, matching what it does in v1; a future input-request node can be its own type.
