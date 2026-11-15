# Transactional emails: brand v2 design (PRD)

> **Status: implemented** (2026-11-15, PR #423). Issue #414, part of Epic #412. Extends #413.

RAGNA Studio's transactional emails (welcome, invitation, passkey added) use plain Tailwind greys.
They don't look like RAGNA. #413 moved all three onto one shared template. This PRD restyles that
template in brand v2 and adds a footer line that names the recipient and the reason for the email.

The design handoff is `ragna-internal/design/studio/emails.md` (private), with frames on the
FigCraft page Emails. Section numbers below (§) refer to it.

## Problem

- The invitation reaches people who have never seen RAGNA. A grey, unbranded email looks like
  phishing.
- No email says which address it went to or why. A misdirected email can't be recognised as such.

## Goals

- All three emails match the Emails frames in de and en, at 600 and 375 px.
- They stay readable in clients without media queries or `<style>` support (Outlook for Windows,
  Gmail).
- The email is self-contained: no images, no web fonts, nothing loaded from a server.
- **Success signal:** the frames and a test send to Apple Mail, Gmail and Outlook look the same,
  apart from the fallbacks the handoff accepts.

## Non-goals

- Legal block, privacy and imprint links, social buttons and the `Reply-To` header: #422. Their
  values come from instance configuration, and how the defaults work on self-hosted instances
  needs a decision first.
- Unsubscribe and email settings links. They need a backend (§9, own issue).
- Handoff decisions 5 to 7: unsubscribe scope, LinkedIn logo, a button in the welcome email.
- New copy. Body copy stays as #413 left it.
- Logo PNGs and web fonts (§4, §7). The logo is live text and the type is Arial, the fallback the
  handoff already designs for. Nothing has to be hosted, nothing tracks opens, and Outlook shows the
  whole email without a "download pictures" prompt. The mark and brand fonts can follow once
  #422 settles asset hosting for its social buttons.

## User stories

Roles: recipient (anyone who receives a transactional email).

### US-1 Branded emails (P1)

As a recipient, I want emails that look like RAGNA, so that I recognise and trust them.

- **US-1.1** Given any transactional email, when it opens in a client with media queries, then
  it matches its frame at 600 and 375 px, set in Arial as in the Outlook fallback frame.
- **US-1.2** Given a client without media queries (Outlook for Windows), when the email opens,
  then it shows the 600 px layout with a square button.
- **US-1.3** Given a client that drops the `<style>` block, when the email opens, then it shows
  the mobile layout and every element is readable at any width.
- **US-1.4** Rule: the email references no images, fonts or other remote files.
- **US-1.5** Rule: colours are hex only, and the HTML stays well under Gmail's 102 KB clip.

### US-2 Dark mode (P2)

As a recipient using dark mode, I want the email in dark colours, so that it doesn't flash white.

- **US-2.1** Given a client that supports `prefers-color-scheme`, when it is in dark mode, then
  the email uses the dark colours, the wordmark included.
- **US-2.2** Given a client that inverts colours on its own (Gmail), when it is in dark mode,
  then every text stays readable.

### US-3 Why line (P1)

As a recipient, I want to see which address an email went to and why, so that I can tell a
genuine email from a misdirected one.

- **US-3.1** Given a welcome, invitation or passkey email in de or en, when it is sent to an
  address, then its footer names that address and the email's reason (§9 table).
- **US-3.2** Given an invitation, when it arrives, then the footer names the inviter and says the
  invitee can ignore it.
- **US-3.3** Given an address with HTML characters, when the email renders, then they appear
  escaped, not as markup.

## Testing

| Criterion        | Level         | Folder                |
| ---------------- | ------------- | --------------------- |
| US-1.1 to US-1.3 | visual review | Mailpit, test sends   |
| US-1.4, US-1.5   | package       | `packages/mail/test/` |
| US-2.1, US-2.2   | visual review | Apple Mail, Gmail     |
| US-3.1 to US-3.3 | package       | `packages/mail/test/` |

The package tests render through `renderTransactionalEmail`, as #413's tests do.

## Standards checklist

- **Deletion:** n/a, no stored data.
- **Retention:** n/a.
- **Erasure:** n/a. The recipient address goes into the email only.
- **Docs:** none. No page describes the emails' look, and no env var changes.

## Design

**Template** (`packages/mail/src/templates/transactional.vue`). Tables only, max 600 px. Mobile
values are the base; desktop values go in `@media (min-width: 600px)` and again in an
`<!--[if mso]>` block (Outlook ignores media queries). Maizzle's own `sm:` variant is
max-width, so the template uses `min-[600px]:`. Spacing §5, button §6 (padding on the `<td>`,
colour on `<td>` and `<a>`, no VML). Type §4 sizes, weights and line heights in
`Arial, Helvetica, sans-serif`. Logo: the wordmark as text, "RAGNA" bold and "Studio" regular in
`email/muted`, 19 px, in place of the §7 PNG. Dark mode §8 with both color-scheme metas. Footer:
only the why line, `small` style, address as a `white-space: nowrap` span.

**Content.** `TransactionalContent` gains `footerReason`, the part after the address
("because you created a RAGNA Studio account." / "weil du ein Konto … erstellt hast."). Each
`src/transactional/<email>.ts` returns it next to the body copy. The frame around the address
("This email was sent to {email}" / "Diese E-Mail wurde an {email} gesendet,") is one shared
string per locale.

**Recipient.** `renderTransactionalEmail` takes `{ to, locale, email }` (the `SendEmailInput`
shape) and passes `to` into the template. `sendEmail` passes its input through.
