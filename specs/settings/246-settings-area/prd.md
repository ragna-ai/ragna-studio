# Settings area and expandable sidebar: one settings section with its own nav (PRD)

> **Status: decided** (2026-10-31). Issue #246.

Settings are spread over four pages that the user reaches through five links in the user menu.
Two of those links open the same page. This PRD moves all account, organization and integration
settings into one settings area with its own grouped nav, like a settings app inside RAGNA Studio.

Both the settings nav and the app nav need a sidebar that can show labels and groups. The app
sidebar has a half-built expanded mode that users can't reach. So this PRD also makes the app
sidebar expandable, built on the same shared sidebar as the settings area.

## Problem

- Settings live at `/account` (profile, language, sidebar, credits, delete account),
  `/settings/organization`, `/settings/connections`, `/settings/mcp` and `/mail/settings`. Each has a different
  page layout.
- The user menu links to each page separately. "Account" and "Settings" both open `/account`.
- New settings (models, allowlists, usage, admin pages) have no obvious home. Each would add
  another user menu link.
- The app sidebar has an expanded state, but its toggle is commented out. Parts of the sidebar
  (user menu, notifications) never adapt to the wide state.
- Three sidebar modes exist (icons only, icons with small labels, expanded). That is more than an
  11-item nav needs.

## Goals

- Users find every setting in one place, with one link in the user menu.
- Each settings section has its own URL that survives a reload and can be shared.
- Users can expand the app sidebar to see labels, and collapse it to icons.
- **Success signal:** the user menu has a single settings entry, and no settings page uses the old
  per-page layout.

## Non-goals

- Search inside the settings nav. Worth adding once there are more sections.
- A mobile layout for either sidebar.
- A keyboard shortcut to toggle the app sidebar. Cmd+B is taken by bold in the editor.
- "New" button, search (command palette) and a "Recent" section in the sidebar. Own issue.
- A credits card in the sidebar footer. It waits for billing, so "Upgrade" has a target.
- New settings. This PRD moves existing ones; new sections (models, billing) get their own PRDs.

## User stories

Roles: user, organization owner or admin, organization member.

### US-1 Expandable app sidebar (P1)

As a user, I want to expand the app sidebar to see labels and collapse it to icons, so that I
can choose between orientation and screen space.

- **US-1.1** Given a collapsed sidebar, when the user expands it, then every nav item shows its
  label next to its icon, and so do the workspace switcher, notifications and user menu.
- **US-1.2** Given an expanded sidebar, when the user reloads the app, then the sidebar is still
  expanded.
- **US-1.3** Given a collapsed sidebar, when the user hovers a nav item, then a tooltip shows the
  item's name.
- **US-1.4** Rule: a collapsed sidebar shows icons only. The "show labels when collapsed"
  preference is no longer offered.
- **US-1.5** Given a user who had turned on "show labels when collapsed", when they open the app,
  then the sidebar shows icons only and no error appears.
- **US-1.6** Given an expanded sidebar, when the user looks at the nav, then the items appear in
  labelled groups (Work, AI, Create). When collapsed, the groups are separated without labels.
- **US-1.7** Given a user who never toggled the sidebar in this browser, when they open the app,
  then the sidebar is expanded.

### US-2 Settings area (P1)

As a user, I want all my settings in one area with its own nav, so that I don't have to hunt
through the user menu for each one.

- **US-2.1** Given a user on any app page, when they open settings from the user menu, then the
  settings area opens on their profile, and its grouped nav replaces the app nav.
- **US-2.2** Given a user in the settings area, when they pick a section, then the address changes
  to that section, and a reload opens the same section.
- **US-2.3** Given a user who entered settings from an app page, when they choose "Back to app",
  then they return to that page. Given they opened a settings address directly, then "Back to
  app" goes to the home page.
- **US-2.4** Given a user without any workspace, when they open settings, then every section they
  may use works and no "no workspace" screen appears.
- **US-2.5** Rule: the user menu has one settings entry instead of one link per page.

### US-3 Role and feature gated sections (P1)

As an organization owner or admin, I want management sections shown only to people who can use
them, so that members don't see settings they can't change.

- **US-3.1** Given an organization member, when they open the settings area, then the Workspaces
  and Usage sections are not in the nav.
- **US-3.2** Given an organization member, when they open the Workspaces or Usage address
  directly, then they land on the organization's general section.
- **US-3.3** Given an instance with the MCP connector turned off, when a user opens settings, then
  the MCP section is not in the nav.

### US-4 Old links keep working (P1)

As a user, I want my existing bookmarks and links to still work, so that nothing breaks after
the move.

- **US-4.1** Given a bookmark to the old account page, when the user opens it, then the profile
  section opens.
- **US-4.2** Given a user connecting an integration, when the provider sends them back, then the
  Connections section opens and shows the success or error message.
- **US-4.3** Given a notification or the MCP consent page linking to a settings section, when the
  user follows it, then that section opens.
- **US-4.4** Given a user in the mail inbox, when they open the mail settings link, then the
  settings area opens on the email section, and so does an old `/mail/settings` bookmark.
- **US-4.5** Given a user whose active workspace isn't their private workspace, when they open
  the email section, then they see a hint with a button to switch to the private workspace.

## Testing

| Criterion                | Level            | Folder          |
| ------------------------ | ---------------- | --------------- |
| US-1.1 to US-1.7         | e2e (Playwright) | `apps/web/e2e/` |
| US-2.1 to US-2.5         | e2e (Playwright) | `apps/web/e2e/` |
| US-3.1 to US-3.3         | e2e (Playwright) | `apps/web/e2e/` |
| US-4.1, US-4.3 to US-4.5 | e2e (Playwright) | `apps/web/e2e/` |
| US-4.2                   | e2e (Playwright) | `apps/web/e2e/` |

US-4.2 opens the return address with the success and error query parameters the API sends. It
doesn't drive a real provider.

## Standards checklist

- **Deletion:** n/a, no stored data changes.
- **Retention:** n/a.
- **Erasure:** n/a. The removed preference only lived in the browser's local storage.
- **Docs:** `getting-started/dashboard-and-navigation.mdx` (sidebar toggle, user menu, settings
  sections), `workspaces/organizations.mdx`, `integrations/connections.mdx` and
  `integrations/social-posts.mdx` (where Organization and Connections now open),
  `integrations/email.mdx` (where Email settings now open).

## Decisions

**A full settings area, not a modal.** Settings get their own layout and nav, like Langdock,
instead of a dialog over the app, like Krea. Organization settings are growing (members,
workspaces, usage, models, allowlists) and need room for tables. A full page also needs no
"background route" routing, which Nuxt has no built-in support for. The loser was a modal with one
address per section: lighter for quick personal toggles, but cramped and harder to route.

**Our own sidebar component, not shadcn-vue's `Sidebar`.** One shared sidebar serves both the app
nav and the settings nav. We keep full control of the collapsed look and avoid its provider,
cookie state and mobile sheet, which we don't need yet. The loser was shadcn-vue's `Sidebar`: more
features for free, but a second styling system to fight.

**Two sidebar states.** The "show labels when collapsed" preference is removed. Collapsed means
icons with tooltips. Expanded means labels. The loser was keeping three modes, which tripled the
layout cases for every sidebar part.

## Design

See [design.md](./design.md).
