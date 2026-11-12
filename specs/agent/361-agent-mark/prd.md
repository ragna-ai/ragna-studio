# Agent mark: an icon on a tone, or an uploaded image (PRD)

> **Status: implemented** (2026-11-12, PR #367). Issue #361. Part of #356 (design handoff 12 Nov 2026, §5).

Every agent looks the same today: the robotic icon on a colour picked from its id. In a list of nine
agents, users find theirs by reading names. This PRD lets the people who edit an agent give it its
own mark: one of 28 icons on one of 8 tones, or a small uploaded image.

## Problem

- The mark is derived from the agent id (`agentTone` in the web app), so users can't choose it.
- The Agents list, the chat picker, chat history and the dashboard all show the mark. It is the
  fastest way to tell agents apart, and today it carries no meaning.
- The approved design (FigCraft `Agents` page, `Agent mark` set) has an "Icon" field in the agent
  settings with an icon picker and an image upload.

## Goals

- Users pick an icon and a tone, or upload an image, in the agent settings.
- Every place that shows an agent's name shows its mark.
- **Success signal:** agents in the dev and prod workspaces get their own marks within a week.

## Non-goals

- The create flow gets the field later, when the design for it exists.
- No free icon search. The 28 icons are a fixed, curated list.
- No image editing (crop position, zoom). Non-square images are centre-cropped.

## User stories

Roles: workspace manager and workspace editor (both can edit agents today).

### US-1 Icon and tone (P1)

As a workspace editor, I want to give an agent one of the offered icons on a colour, so that I can
tell my agents apart at a glance.

- **US-1.1** Given an agent, when the editor saves an icon and a tone, then every response that
  returns the agent's name also returns that icon and tone.
- **US-1.2** Given an icon that is not in the offered list, or an unknown tone, when the editor
  saves, then the request is rejected with `422` and the agent is unchanged.
- **US-1.3** Given an agent with no icon, when it is shown, then it gets the robotic icon on the
  tone derived from its id, as today.
- **US-1.4** Rule: 28 icons and 8 tones (`sea`, `sage`, `ochre`, `clay`, `dusk`, `plum`, `rose`,
  `stone`), the same list in the picker and in the API's validation.

### US-2 Image (P1)

As a workspace editor, I want to upload a small image as the agent's mark, so that an agent can
carry a logo or a face the team recognises.

- **US-2.1** Given a PNG or JPEG up to 2 MB, when the editor uploads it and saves the agent, then
  every response that returns the agent's name returns an image URL, and the mark shows the image
  instead of the icon.
- **US-2.2** Given an uploaded image, when processing has finished, then the stored image is
  80 × 80 pixels, centre-cropped if it wasn't square.
- **US-2.3** Given a file over 2 MB or of another type, when the editor uploads it, then the
  request is rejected with `413` or `415` and nothing is stored.
- **US-2.4** Given an agent with an image, when the editor removes it and saves, then the image URL
  is gone and the mark falls back to the icon. The stored file is deleted.
- **US-2.5** Given an agent with an image, when the agent is deleted, then its stored image is
  deleted too.

### US-3 Choose the mark in the settings (P1)

As a workspace editor, I want an "Icon" field at the top of the agent settings, so that I change
the mark where I change the agent's name.

- **US-3.1** Given the agent settings, when the editor picks a tone and an icon and saves, then the
  Agents list shows the new mark.
- **US-3.2** Given the agent settings, when the editor uploads an image and saves, then the Agents
  list shows the image.
- **US-3.3** Given unsaved mark changes, when the editor leaves without saving, then the agent
  keeps its old mark (the field saves with the page, like the other fields).

## Testing

| Criterion | Level            | Folder                 |
| --------- | ---------------- | ---------------------- |
| US-1.1    | API              | `apps/api/test/agent/` |
| US-1.2    | API              | `apps/api/test/agent/` |
| US-1.3    | visual review    |                        |
| US-1.4    | API              | `apps/api/test/agent/` |
| US-2.1    | API              | `apps/api/test/agent/` |
| US-2.2    | worker           | `apps/worker/test/`    |
| US-2.3    | API              | `apps/api/test/agent/` |
| US-2.4    | API              | `apps/api/test/agent/` |
| US-2.5    | API              | `apps/api/test/agent/` |
| US-3.1    | e2e (Playwright) | `apps/web/e2e/`        |
| US-3.2    | e2e (Playwright) | `apps/web/e2e/`        |
| US-3.3    | e2e (Playwright) | `apps/web/e2e/`        |

## Standards checklist

- **Deletion:** removing the image or deleting the agent detaches the media row and runs
  `deleteMediaIfUnreferenced`. An upload that is never saved has no reference, and the existing
  media sweep removes it.
- **Retention:** n/a. Only the 80 × 80 version is kept; the original is replaced by the worker.
- **Erasure:** the image is a workspace-owned media row, so workspace and organization purge already
  reach it.
- **Docs:** `apps/docs/src/content/docs/agents/index.mdx` gets a short "Icon" section.

## Design

**Data.** `agents` gets three nullable columns: `icon` (text), `tone` (text) and `image_media_id`
(FK to `media.id`, `on delete set null`), plus the relation in `relations.ts`. `countMediaReferences`
and the sweep's join count `agents.image_media_id` as a reference. Migration via `db:generate`.

**Shared lists.** One client-safe module exports the 28 icon names and the 8 tones as zod enums. The
API validates with them, the web picker renders from them. Proposed home: `@repo/ai/client`, next to
the agent tool ids the web already imports from there.

**API.**

- `POST /workspace/:workspaceId/agent/image-upload`: multipart `file`, the same body limit and
  content sniffing as the existing reference uploads (PNG or JPEG only). Stores a workspace-owned
  media row in the images bucket, enqueues the resize job and returns `{ mediaId }`.
- `PATCH /workspace/:workspaceId/agent/:agentId` accepts `icon`, `tone` and `imageMediaId` (each
  nullable). An `imageMediaId` must belong to the workspace and be an image. Replacing or clearing
  it runs `deleteMediaIfUnreferenced` on the old id.
- Every agent payload that carries the name adds `icon`, `tone` and `imageUrl` (null when unset):
  agent list and detail, chat and chat history, the chat agent picker, the home overview.

**Worker.** A new queue `agent-image` with a `{ mediaId }` DTO. The processor downloads the object,
runs ffmpeg (already in the worker image) to centre-crop and scale to 80 × 80 PNG, uploads it under
the same media id under a new storage key (`<workspaceId>/images/agent-images/<mediaId>.png`, so the CDN never serves the stale original) and updates the row's key, MIME type and size, then
deletes the original object. Until then the original is served. The web previews a picked file from
memory until the agent is saved, because the original's URL stops working once the worker is done.

**Web.** `AgentMark` gets `icon`, `tone`, `imageUrl` and size 40 (image, else icon on its tone, else
today's fallback). Every `AgentMark` caller passes the fields it now has. The Persona section gets
the "Icon" field per the design (popover with Icon and Image tabs). The four new `--id-*` tones are
synced from the design file.

## Decisions

- **Resize in the worker, not the API** (Sven, 12 Nov). The API image has neither ffmpeg nor an
  image library; the worker already runs ffmpeg for watermarks. The cost is a short window where the
  original (up to 2 MB) is served. Lost alternatives: ffmpeg in the API image (about 80 MB more),
  `sharp` (a native dependency on Bun), no resize at all.
