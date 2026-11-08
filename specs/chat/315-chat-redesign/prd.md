# Chat redesign: start page, conversation, composer and history (PRD)

> **Status: implemented** (2026-11-08, PR #316). Issue #315. Builds on the studio shell (#312, PR #313).

The chat page moves to the new RAGNA Studio design. The shell from #312 gives the frame; this PRD
covers what happens inside it: the start page, the conversation, the composer with its popovers,
and the chat history. Frontend only: the API and database stay as they are.

## Problem

- The chat still looks like the old app inside the new shell: its own colours, Lucide icons and a
  floating History and search control at the page's top left.
- The composer mixes styles: pills per tool with colours, a disclaimer line, a wide input.
- Message actions hide in a menu, and tool activity is a stack of badges.

## Goals

- The chat reads like the rest of the new shell: one column, one toolbar style, Hugeicons.
- Page controls (history, search, agent) live in the top bar, where every page puts its actions.
- **Success signal:** the chat screens match the approved design frames in a visual review.

## Non-goals

- Starter cards, dictation, adding Docs or datasets to a chat, per-chat tool switches, a live
  "working" state and stored agent icons. Each needs an API change and its own issue.
- Moving the history into the main panel. It stays in today's side panel, with the design's look.
- The chat search page, the full history page and generated media results get the new tokens only,
  no new layout.

## User stories

Roles: user (any signed-in person).

### US-1 Page actions in the top bar (P1)

As a user, I want each page's own controls in the top bar, so that I find them in the same place on
every page.

- **US-1.1** Given a chat page, when it loads, then the top bar shows the History toggle after the
  sidebar toggle, the chat's title (or "New chat") and, on the right, chat search or the chat's agent.
- **US-1.2** Given any other page, when it loads, then its top bar shows the sidebar toggle and the
  breadcrumb as today.
- **US-1.3** Given the History toggle, when the user uses it, then the history opens or closes and
  the toggle shows its state.

### US-2 Start page (P1)

As a user, I want a calm start page, so that I can ask an agent right away.

- **US-2.1** Given a user with agents, when they open the chat, then they see a greeting with their
  first name, the composer and their recent chats with a link to all chats.
- **US-2.2** Given the recent chats, when the user hides them, then they stay hidden after a reload.
- **US-2.3** Given a workspace without agents, when the user opens the chat, then they see today's
  no-agent state.

### US-3 Composer (P1)

As a user, I want one composer with the tools I need, so that I can write, attach and send without
hunting for controls.

- **US-3.1** Given the composer, when the user opens the add menu and chooses "Add files", then the
  file picker opens and the files attach to the message.
- **US-3.2** Given an agent with tools, when the user opens the tools from the composer, then a
  panel lists that agent's tools with a description and a link to edit them in the agent.
- **US-3.3** Given a new chat, when the user opens the agent picker, then they can search and pick
  an agent. Given an existing chat, then the agent can't be changed.
- **US-3.4** Given a message being answered, when the user presses send again, then the answer stops.

### US-4 Conversation (P1)

As a user, I want to read and act on answers easily, so that I can keep working with the result.

- **US-4.1** Given an agent answer, when it shows, then it carries the agent's name and mark, and
  copy and branch are available as buttons.
- **US-4.2** Given an answer that used tools, when it shows, then a one-line summary says how many
  tools ran and their outcome, and the user can expand it to see each call.
- **US-4.3** Given an action that needs approval, when it shows, then the user sees what will be
  saved and can approve or deny it. Nothing is saved before approval.

### US-5 History (P2)

As a user, I want the history to show where I am, so that I can switch chats quickly.

- **US-5.1** Given the history panel, when it is open, then chats are grouped into Today, Yesterday,
  This week and Earlier, and the current chat is highlighted.
- **US-5.2** Given the history panel, when the user types in its search field, then the list shows
  only chats whose title matches. When they confirm, the full chat search opens with that text.
- **US-5.3** Given a chat in the history, when the user renames it, then the new title shows in the
  history and the top bar.

## Testing

This is a design change and adds no e2e tests. Existing specs (`agent-chat.spec.ts`,
`prompt-editor.spec.ts`, `nav-sidebar.spec.ts`) are adapted where the new structure breaks them.
All criteria are checked in a visual and manual review against the design.

## Standards checklist

- **Deletion:** n/a, no stored data.
- **Retention:** n/a.
- **Erasure:** n/a.
- **Docs:** `apps/docs` page `agents/chat.mdx`.

## Decisions

**Each page renders its own top bar.** The layout keeps only the sidebar and the panel frame. A page
renders a panel with a header (the top bar, with left, default and right slots) and a body. This is
the pattern Nuxt UI's dashboard uses, and slots pass page components without a portal. It replaces
the layout-owned bar and the shared breadcrumb state from #312: the breadcrumb becomes a prop of the
bar. Alternatives: teleporting page parts into a layout bar (smaller change, but a portal), or
registering components in shared state (clumsy for interactive parts).

## Design

- **Shell:** a panel component (header slot defaulting to the top bar, scrolling body). `NavTopBar`
  takes the breadcrumb as a prop and offers left, default and right slots; without content on the
  right it shows today's placeholders. `usePageBreadcrumb` and its state are removed. Every page in
  `layouts/default.vue` renders the panel; the settings layout keeps its bar-less panel.
- **Chat:** `pages/chat/*` and `features/chat/*` follow the approved chat design. The vendored
  `components/ai-elements` are wrapped and styled from the chat feature, not edited, unless a prop
  is missing.
- **Fonts and icons:** Bricolage Grotesque (600) via `@nuxt/fonts` for the start greeting only.
  Hugeicons in the chat feature; tool icon names live in `agent-tool-icons.ts` and are added to the
  icon client bundle in `nuxt.config.ts`.
