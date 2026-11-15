# Transactional emails in the user's language (design)

> **Status: proposed** (2026-11-15). Issue #413. Requirements in [prd.md](./prd.md).

## Locale list (US-1, US-3.5)

One definition, in `@repo/utils` (`src/locale.ts`, exported from the root):

```ts
export const USER_LOCALES = ['en', 'de'] as const;
export const userLocaleSchema = z.enum(USER_LOCALES);
export type UserLocale = z.infer<typeof userLocaleSchema>;
export const DEFAULT_USER_LOCALE: UserLocale = 'de';
```

`@repo/database`, `@repo/mail` and `apps/api` already depend on `@repo/utils`. `@repo/queue` gets
one new edge to it (`@repo/utils` only depends on `@repo/config`, which the queue already uses). The
codes match the Nuxt i18n locale codes in `apps/web/nuxt.config.ts`. The web app doesn't import
`@repo/utils`, because that would pull `@repo/config` into the web type graph.

## Schema

`users.locale`: `text('locale').$type<UserLocale>()`, nullable. `null` means "not known yet"
(existing users until their next app visit, US-1.4). Migration through `db:generate`.

better-auth: `user.additionalFields.locale = { type: 'string', required: false, input: false }`.
`input: false` stops clients from setting it on sign-up. The session user then carries `locale`, and
the web auth client gets `inferAdditionalFields` so the type knows it.

## First sign-in (US-2)

- Web: `authClient.signIn.social({ ..., additionalData: { locale } })` with the current i18n locale.
- Auth: `databaseHooks.user.create.before` sets `locale` from, in order:
  1. `additionalData.locale` from the OAuth state (`getOAuthState()` from `better-auth/api`),
     parsed with `userLocaleSchema`. The client sends it, so it is untrusted.
  2. The first supported language in the callback request's `Accept-Language` (`de-AT` counts as
     `de`; q-values respected).
  3. `DEFAULT_USER_LOCALE`.
- Only `create` runs this, so a later sign-in never changes a stored language (US-2.4).

## API

`PATCH /user/profile` accepts `{ name?, locale? }`. `locale` is parsed with `userLocaleSchema`.
Anything else answers `400` (problem+json, as every validation error). `GET /user/profile` and the
session return `locale` (`'en' | 'de' | null`).

## Web

- **Settings > Language:** `setLocale()` plus `PATCH /user/profile { locale }`. On error the
  interface switches back and shows a toast.
- **Sync on app load** (one composable, called once in the signed-in layout): if the session's
  `locale` is `null`, store the current i18n locale (US-1.4). If it differs from the current one,
  `setLocale(sessionLocale)` (US-1.3).
- The settings subtitle mentions emails: "Choose the language for the interface and emails." /
  "Wähle die Sprache für die Benutzeroberfläche und E-Mails."

## Queue

Each email job DTO gets `locale: userLocaleSchema.default(DEFAULT_USER_LOCALE)`. The default keeps
jobs queued before the deploy valid, and covers users with no stored language (US-3.4).

| Job           | Locale source                                    |
| ------------- | ------------------------------------------------ |
| welcome       | the new user's `locale` (set in `create.before`) |
| invitation    | the inviter's `locale`                           |
| passkey-added | the session user's `locale`                      |

## `@repo/mail`

```ts
export type TransactionalEmail =
  | { id: 'welcome'; variables: WelcomeVariables }
  | { id: 'invitation'; variables: InvitationVariables }
  | { id: 'passkey-added'; variables: PasskeyAddedVariables };

export interface SendEmailInput { to: string; locale: UserLocale; email: TransactionalEmail }
export async function sendEmail(input: SendEmailInput): Promise<...>;
```

- `src/templates/transactional.vue` is the only template. Props: `locale` (for `<Html lang>`),
  `preheader`, `heading`, `paragraphs: string[]`, `action?: { label, url }`. Text is interpolated,
  never `v-html`, so names stay escaped.
- `src/transactional/<email>.ts` holds one function per locale:
  `Record<UserLocale, (variables) => TransactionalContent>`, where `TransactionalContent` is
  `{ subject, preheader, heading, paragraphs, action? }`. A missing locale fails type-check.
- A typed registry maps `TransactionalEmail['id']` to those records, so a new id without messages
  fails type-check.
- `sendEmail` picks the content, renders the layout and sends with the content's subject. The worker
  no longer writes subjects.
- The old `welcome.vue`, `invitation.vue` and `passkey-added.vue` are deleted.

### Copy

| Email         | en                                                                                                                                                                                                                                | de                                                                                                                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| welcome       | **Welcome to RAGNA Studio** / Welcome, {name}. / Thanks for joining RAGNA Studio.                                                                                                                                                 | **Willkommen bei RAGNA Studio** / Willkommen, {name}. / Schön, dass du bei RAGNA Studio bist.                                                                                                                                                                       |
| invitation    | **{inviter} invited you to {organization}** / {inviter} invited you to join {organization}. / Sign in with this email address to join. / [Join {organization}]                                                                    | **{inviter} hat dich zu {organization} eingeladen** / {inviter} hat dich eingeladen, {organization} beizutreten. / Melde dich mit dieser E-Mail-Adresse an. / [{organization} beitreten]                                                                            |
| passkey-added | **A passkey was added to your RAGNA Studio account** / Hi {userName}, / A passkey named {passkeyName} was added to your account. / If this wasn't you, remove it in your passkey settings and sign out. / [Open passkey settings] | **Neuer Passkey in deinem Konto bei RAGNA Studio** / Hallo {userName}, / Ein Passkey namens {passkeyName} wurde zu deinem Konto hinzugefügt. / Warst du das nicht? Entferne ihn in deinen Passkey-Einstellungen und melde dich ab. / [Passkey-Einstellungen öffnen] |

Bold is the subject, `[...]` the button. The preheader is the first paragraph.

## Extension points

- **Axis 1, locale.** Known: `en`, `de`. Adding one: a code in `USER_LOCALES`, a locale file in the
  web app, then type-check lists every email that lacks the new language.
- **Axis 2, email.** Known: welcome, invitation, passkey-added (#413), more under #412. Adding one:
  a union member in `TransactionalEmail`, one `src/transactional/<email>.ts`, a registry entry, a
  job DTO and a processor case.
- **Restyle (#414):** only `transactional.vue` changes.
- **Fakes:** `@repo/testing`'s `sendEmailMock` is typed from `sendEmail`, so the new input shape
  breaks it at compile time. `@repo/mail` tests render the real layout for both locales.
- **Packages considered:** `vue-i18n` through Maizzle's `vue.plugins`. Rejected: string keys aren't
  type-checked per email, and it adds a dependency for six strings per email.
- **Not abstracted:** no per-email `.vue` files, no slot-based layout component (see the PRD
  decision on the Maizzle spike).
