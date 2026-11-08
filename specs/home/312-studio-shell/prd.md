# Studio shell: new app shell, sidebar and dashboard (PRD)

> **Status: implemented** (2026-11-08, PR #313). Issue #312. Extends the home overview PRD (`specs/home/prd.md`).

RAGNA Studio gets a new visual design. This PRD covers the first part: the app shell (window, main
panel, top bar), the main and settings sidebars, and the dashboard. Other screens follow later and
reuse what is built here. Frontend only: the API and database stay as they are.

## Problem

- The shell, the sidebar and the dashboard each grew their own look. Colours, radii and icons are
  set per component, so a new screen can't follow one design.
- Navigation context lives in each page's header. Every page builds its own breadcrumb, and pages
  without one give no sense of place.
- The dashboard shows six equal cards. Nothing tells the user what needs attention today.

## Goals

- One set of design tokens (colours, radii, type scale, layout constants) that every screen reads.
- One shell: an inset main panel with a top bar that holds the sidebar toggle and the breadcrumb.
- A dashboard that opens with what is due today, built on today's overview data.
- **Success signal:** new screens are built from the tokens and shell parts without one-off colours
  or sizes.

## Non-goals

- Dark mode. It is not designed; the existing dark values stay untouched and no toggle ships.
- Search, the top bar's favourite and more actions. They render as disabled placeholders.
- New dashboard data (task labels, run timing, live agent state). Each needs an API change and its
  own issue.
- Restyling the remaining screens. Until they are migrated, they may look inconsistent.

## User stories

Roles: user (any signed-in person).

### US-1 App shell and top bar (P1)

As a user, I want every page in one framed panel with a top bar, so that I always know where I am
and where the controls are.

- **US-1.1** Given any page outside the settings area, when it loads, then it shows in a panel
  inset from the window edge, with a top bar holding the sidebar toggle on the left. Settings
  pages use the same panel without a top bar, because their sidebar doesn't collapse.
- **US-1.2** Given the sidebar is expanded or collapsed, when the user uses the toggle, then the
  sidebar switches state, the toggle stays in place and the state survives a reload.
- **US-1.3** Given the top bar's favourite and more actions, when the user activates them, then
  nothing happens and assistive technology reports them as disabled.

### US-2 One breadcrumb per page (P1)

As a user, I want one breadcrumb in the top bar, so that I see my place in the app the same way on
every page.

- **US-2.1** Given a page that declares no trail, when it loads, then the breadcrumb shows its
  section name (for example "Datasets").
- **US-2.2** Given a detail page (for example a dataset), when its data has loaded, then the
  breadcrumb shows the section as a link followed by the item's name as the current page.
- **US-2.3** Given the user navigates from a detail page to another section, when the new page
  loads, then no crumb from the previous page remains.
- **US-2.4** Rule: the page body no longer shows its own breadcrumb. A page that lets the user
  rename the item keeps the rename field in its header.

### US-3 Sidebar (P1)

As a user, I want a sidebar that names my workspace and keeps my place, so that I switch areas
without losing track.

- **US-3.1** Given the expanded sidebar, when it shows, then it lists from top to bottom: the
  workspace row, a search field, the navigation in today's order and groups, notifications and the
  user row.
- **US-3.2** Given the workspace row, when the user opens it, then a menu lists the workspaces
  grouped by visibility, marks the active one, and offers adding and managing workspaces. The row
  shows the active workspace's initial and name over the organization's name.
- **US-3.3** Given the user row, when the user clicks it, then a menu opens with the account, the
  credit balance, Settings, Sign out and the app version. The row shows the user's name and
  organization role.
- **US-3.4** Given the collapsed sidebar, when the user hovers a navigation icon, then a tooltip
  shows its name, and unread notifications show as a dot instead of a count.
- **US-3.5** Given the search field, when the user activates it, then nothing happens and it is
  reported as disabled.
- **US-3.6** Given the settings area, when it loads, then its sidebar uses the same look and icons
  as the main sidebar.
- **US-3.7** Rule: workspaces are switched in the workspace row only; the user menu holds no
  workspace switching. Both menus open on click or keyboard, not on hover.

### US-4 Dashboard (P1)

As a user, I want the dashboard to lead with what is due today, so that I know where to start.

- **US-4.1** Given tasks due today and failed workflows, when the dashboard loads, then a summary
  line names both counts. A count of zero is left out; with both zero it says nothing is due today.
  Failed workflows are counted among the five the overview returns.
- **US-4.2** Given open tasks, when the Tasks card shows, then its rows are sorted by due date
  (tasks without one last) and show "Today", "Tomorrow" or a short date.
- **US-4.3** Given workflows, when the Workflows card shows, then each row shows the last run's
  status, or "Never run" when there is none.
- **US-4.4** Given agents, when the Agents card shows, then each agent shows its model and keeps
  the same colour on every visit.
- **US-4.5** Given tasks scheduled for today, when the Today card shows, then it lists them with
  their time, left empty for tasks without a time of day.
- **US-4.6** Given a card with no items, when the dashboard loads, then the card shows its empty
  state with a link to create the first item. Documents and chats are no longer shown.

### US-5 States and widths (P2)

As a user, I want clear hover and focus states and a layout that fits my window, so that I can
work by mouse, keyboard and on smaller screens.

- **US-5.1** Given keyboard navigation, when a sidebar item, button or card row gets focus, then
  it shows a visible focus ring.
- **US-5.2** Given a window narrower than 1024 px and no saved preference, when the app loads,
  then the sidebar starts collapsed and the dashboard's right column moves under the left one.
- **US-5.3** Given the user prefers reduced motion, when the sidebar toggles or an item is
  running, then nothing animates.

## Testing

| Criterion                | Level            | Folder                               |
| ------------------------ | ---------------- | ------------------------------------ |
| US-1.1, US-1.2, US-1.3   | e2e (Playwright) | `apps/web/e2e/shell.spec.ts`         |
| US-2.1 to US-2.4         | e2e (Playwright) | `apps/web/e2e/breadcrumb.spec.ts`    |
| US-3.1 to US-3.5, US-3.7 | e2e (Playwright) | `apps/web/e2e/nav-sidebar.spec.ts`   |
| US-3.6                   | e2e (Playwright) | `apps/web/e2e/settings-area.spec.ts` |
| US-4.1 to US-4.6         | e2e (Playwright) | `apps/web/e2e/dashboard.spec.ts`     |

The failed-workflow half of US-4.1 has no e2e test: a failed run can't be produced through the
API without the worker.
| US-5.1, US-5.2 | e2e (Playwright) | `apps/web/e2e/nav-sidebar.spec.ts` |
| US-5.3 | manual | n/a |

The web app has no unit test runner, so the dashboard's sorting and summary rules are covered
through seeded e2e data.

## Standards checklist

- **Deletion:** n/a, no stored data.
- **Retention:** n/a.
- **Erasure:** n/a.
- **Docs:** `apps/docs` page `getting-started/dashboard-and-navigation.mdx`.

## Decisions

**The layout owns the breadcrumb, pages declare it.** The top bar renders the only breadcrumb.
A page sets its trail through one composable; without it, the trail is the section name from the
navigation config. This is the common pattern in apps with a top bar and replaces the per-page
breadcrumb component. The alternative, route meta only, can't show names loaded from the API.

**The dashboard hides data the API still returns.** Documents and chats stay in the overview
response but are not rendered. Changing the API is out of scope; the unused fields cost little and
can be dropped with the next overview API change.

## Design

- **Theme:** `apps/web/app/assets/css/main.css` gets the new light values, Tailwind theme tokens
  and layout constants. The `.dark` block stays. Shared shadcn variants are not changed.
- **Fonts and icons:** Geist Mono via `@nuxt/fonts`. Hugeicons via `@iconify-json/hugeicons`
  (MIT, data only) through the existing `@nuxt/icon`. Names held in `.ts` files are listed in
  `nuxt.config.ts`, because the client bundle scan only sees templates.
- **Shell:** `layouts/default.vue` and `layouts/settings.vue` share the inset panel. A new top bar
  component replaces the sidebar toggle in the sidebar header.
- **Breadcrumb:** a `usePageBreadcrumb` composable writes to shared state that the top bar reads
  and clears on route change. `PageBreadcrumb.vue` is removed; its 12 callers move to the
  composable.
- **Sidebar:** `SidebarShell`, `SidebarGroup`, `SidebarItem` and `nav.css` take the new look.
  Nav items carry Hugeicons names instead of Lucide components, in `useNavItems.ts` and
  `useSettingsNavItems`. The workspace and user menus keep their content with new triggers.
- **Dashboard:** `pages/index.vue` and `features/home/components/` are rebuilt on
  `useHomeOverview`. The calendar card becomes a Today card without day paging.
