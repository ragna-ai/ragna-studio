# API errors: research and conclusions

Reference doc, not a PRD: no `Status:` line (see [../../README.md](../../README.md)).

Research done on 2026-11-06 for the [API errors standard](../api-errors/prd.md) (#172, #293). It
records which practices the standard follows, which it leaves out, and why.

## Question

Who owns the text of an error message the user sees, and what does the API send so that clients
can react to an error without parsing English prose?

## Options weighed

1. **The API sends an i18n key.** Precise, and the chat stream already does it. But the API then
   depends on the web's locale files, a renamed key changes both sides, and other clients get a
   key instead of an identifier.
2. **The API sends a stable problem `type`, the web maps it to its own key.** The web owns all
   text, and the types form a small, documented contract. Adding a type touches both sides.
3. **Web only: status code plus the calling feature's context.** No contract, but it can't tell
   the special cases apart (organization deleted, LinkedIn not connected, existing draft).

Chosen: option 2, with types only where a client reacts differently and option 3 as the default.

## Sources and what they say

- **[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)**, Problem Details for HTTP APIs.
  - `type` should be an absolute URI and should resolve to documentation. Changing it later
    "creates a new identity" and breaks clients.
  - `about:blank` means "no additional semantics beyond that of the HTTP status code". Generic
    problems "are usually better expressed as plain status codes".
  - "Consumers SHOULD NOT parse the detail member for information." Machine data belongs in
    extension members.
  - The validation example: an `errors` member with one `{ detail, pointer }` entry per issue,
    `pointer` being a JSON Pointer such as `#/age`.
  - One problem per response. Batch types are discouraged.
  - `status` must match the real HTTP status. No stack dumps or implementation details.
  - Clients must ignore extension members they don't recognize.
  - The IANA registry holds only `about:blank`. Application-specific types can't be registered.
- **[Google AIP-193](https://google.aip.dev/193)**, errors.
  - A machine-readable `reason` per error, stable for the same error.
  - Every value in a message must also be in structured `metadata`, "so that machine actors do
    not need to parse error messages".
  - Once clients may depend on message text, the text becomes part of the contract.
- **[Zalando RESTful API guidelines](https://opensource.zalando.com/restful-api-guidelines/)**.
  - Rule 176: must support problem JSON. Rule 177: must not expose stack traces.
  - Rule 189: should send `Deprecation` and `Sunset` headers for deprecated API elements.
- **[Stripe API errors](https://docs.stripe.com/api/errors)**.
  - A short `code` for errors a client handles in code, `param` to show a message next to the right
    form field, and `doc_url` pointing to the code's documentation.
  - Generic errors get "a very generic error" message in the client.
- **[FeatherPanel PR #284](https://github.com/MythicalLTD/FeatherPanel/pull/284)**, the same
  bug as #293 in another project.
  - The frontend translates by backend error code and falls back to the caller's text.
  - A CI script fails when a backend code has no translation.
- **[RFC 9745](https://www.rfc-editor.org/rfc/rfc9745.html)** (`Deprecation` header) and
  **[RFC 8594](https://www.rfc-editor.org/info/rfc8594)** (`Sunset` header).
  - Both describe a whole resource, not single fields in a body.
- **ASP.NET Core ProblemDetails**
  ([overview](https://codewithmukesh.com/blog/problem-details-in-aspnet-core/)).
  - Adds a `traceId` extension by default, so support can find the log lines behind an error.
- Guides on field errors ([httpstatuses.net](https://httpstatuses.net/guides/rfc-9457-problem-details/),
  [http.dev](https://http.dev/problem-details)).
  - Each field error carries a stable code, a pointer and a detail.
  - Pointer syntax varies (`#/age` or `/age`). Pick one and document it.

## Conclusions

The standard follows these practices:

- Absolute type URIs under `https://docs.ragna.io/errors/<slug>`, each with a docs page.
- Few types. Everything else is `about:blank`, and the web shows the calling feature's message.
- `title` and `detail` stay English for developers and logs. The web never shows or parses them.
- Field errors are `errors: [{ rule, pointer?, detail? }]`, with a machine-readable `rule` and
  pointers in the `#/field` form.
- Values a translation needs get a structured member (Google's rule). They are added when a client
  first needs one.
- The web maps types and rules with typed records, and `check-types` fails on a missing English
  key. Missing German keys are caught by #198.
- Unknown types and extension members are ignored, so a new type never breaks an older web build.
- `Content-Language: en` on every problem response, as in the RFC's examples.

The standard deliberately leaves out:

- **Translated `title` via `Accept-Language`.** The RFC allows it, but it would split text
  ownership between the API and the web.
- **`Deprecation` and `Sunset` headers** for removing `code` and `error`. They describe resources,
  not body fields. Release notes and the docs announce the removal instead.
- **A trace id extension.** Useful, but the API has no request ids yet. Tracked in #295.
- **A third-party problem details package.** The format is a few fields, and a zod schema is what
  both the API and the web need anyway.
