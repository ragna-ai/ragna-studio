# Settings area and expandable sidebar (design)

> Design for [prd.md](./prd.md), issue #246.

Frontend only (`apps/web`). No API, schema or package changes.

**Shared sidebar.** `components/sidebar/` holds the shell: header slot, grouped items, footer
slot, and a `collapsed` prop. Items render a tooltip when collapsed and a label when expanded.
`NavSidebar` and the settings layout both use it. The settings nav is always expanded.

**App sidebar.** `navsidebar.store` keeps `expanded` (persisted) and drops
`showLabelsWhenCollapsed`. On load it removes the old `nav-sidebar:show-labels-when-collapsed`
local storage key. `NavSideToggle` comes back. `WorkspaceSwitcher`, `NavNotifications` and
`NavUserMenu` take the expanded state. The unused "More" dropdown branch is deleted.
`expanded` defaults to `true`, so only browsers without a stored value start expanded.

**Sidebar look.** Nav items, notifications and the user row share one row style: fixed height,
small icons and a muted label. Hover is a soft tint. The active row is a raised white pill with a
hairline border, with no bold and no scaling. Every row starts at the same left edge. The header
is only the collapse toggle, in the same icon column as the nav rows. Group labels are small uppercase. The footer has a Notifications row (unread
count badge) and the user row: name, current workspace as a muted second line, and a menu
affordance. The user menu holds a Workspace submenu (workspaces, add, manage), the credit
balance, Settings, Help and sign out. The workspace switcher on the home page heading stays. `useNavItems()` returns groups: Home (and Mail in the private
workspace) ungrouped, then Work (Tasks, Documents, Datasets), AI (Chat, Agents, Workflows) and
Create (Images, Videos, Social).

**Settings routes.** `layouts/settings.vue`, selected with `definePageMeta({ layout: 'settings' })`.

| Group        | Section     | Path                                | Content                                    |
| ------------ | ----------- | ----------------------------------- | ------------------------------------------ |
| Account      | Profile     | `/settings/profile`                 | Profile form, delete account at the bottom |
| Account      | Language    | `/settings/language`                | Language                                   |
| Account      | Credits     | `/settings/credits`                 | Credits                                    |
| Organization | General     | `/settings/organization`            | Name, transfer, danger zone                |
| Organization | Members     | `/settings/organization/members`    | Members, invitations                       |
| Organization | Workspaces  | `/settings/organization/workspaces` | Workspaces (owner or admin)                |
| Organization | Usage       | `/settings/organization/usage`      | Usage (owner or admin)                     |
| Integrations | Connections | `/settings/connections`             | Unchanged                                  |
| Integrations | MCP         | `/settings/mcp`                     | Unchanged, only when the connector is on   |
| Email        | General     | `/settings/mail`                    | Mailbox, default draft agent, disconnect   |
| Email        | Categories  | `/settings/mail/categories`         | Categories                                 |
| Email        | Senders     | `/settings/mail/senders`            | Auto-draft senders                         |

- `/settings` and `/account` redirect to `/settings/profile` via `definePageMeta({ redirect })`.
- `/mail/settings` redirects to `/settings/mail`. The inbox keeps its settings link, now pointing
  to `/settings/mail`.
- The Email group always shows. Its pages keep `EmailPrivateWorkspaceGate`, so outside the
  private workspace they show the switch hint. Without a connected mailbox they show the existing
  "not connected" message.
- Existing `/settings/connections`, `/settings/mcp` and `/settings/organization` addresses keep
  their paths, so the API's OAuth return path and notification links need no change.
- A `useSettingsNavItems()` composable builds the grouped nav, gated by organization role and MCP
  availability. Gated pages redirect to `/settings/organization` themselves.
- "Back to app": a router `afterEach` hook stores the last non-settings `fullPath` in session
  storage when entering `/settings`. Fallback is `/`.
- `layouts/default.vue` drops `/settings` and `/account` from `ROUTES_WITHOUT_WORKSPACE`, since
  settings no longer use that layout.
- The user menu has one "Settings" entry and drops the Account, MCP, Connections and
  Organization links. The account page's "Sidebar" tab goes away.
