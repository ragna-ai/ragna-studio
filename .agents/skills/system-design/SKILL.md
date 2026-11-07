---
name: system-design
description: "Apply before designing a feature with a seam: variants (providers, model types, storage backends, export formats), a shared client, a registry, or a new abstraction. Separates known from speculative variants, weighs two or three approaches, and decides functions vs classes and how dependencies are passed. Use when writing a design doc or planning anything that will get a second implementation."
---

Design the seam once, build only what is needed now. Adding the next variant should mean adding one new implementation and registering it, not refactoring existing code.

**Context for newcomers.** This is a TypeScript monorepo (pnpm workspaces, shared code in `packages/*`, apps in `apps/*`). The code is functional-first: plain functions and modules by default, classes only where they clearly fit. There is no dependency-injection container, by choice. Runtime validation uses zod. Feature design docs live in `specs/<feature>/design.md` (see the spec-writing skill).

**Related skills.** Building a connector to an external vendor account: also load integration-connector. Adding a dependency: load dependency-choice. Writing tests: follow tdd.

## Known vs speculative variants

The line between good design and YAGNI ("you aren't gonna need it") is whether the next variant is real.

- **Known**: named in a GitHub issue, a spec, or by the user ("Google first, Microsoft next"). Design the contract now so it fits all known variants. Build only the first implementation.
- **Speculative**: "maybe Dropbox one day". Don't abstract for it. Keep the code direct and let the second real case shape the seam.

If you can't tell which it is, ask the user before designing.

## Before proposing a design

Answer these in the design doc, or in your plan for small work:

1. **What varies?** Name the axis: vendor, resource type, transport, output format. One axis per contract.
2. **Which variants are known?** Check open issues (`gh issue list`), `specs/`, and the user's request. List them.
3. **Does the repo already solve this shape?** Search sibling packages for an existing contract, registry or client of the same kind. Extend it before inventing a parallel one.
4. **Is there a maintained open-source package for it?** For a bigger feature or abstraction, run the dependency-choice checks and list the package as one candidate.
5. **What goes in the contract?** Only what every known variant can honour. Variant quirks stay inside the implementation.
6. **What does adding variant N+1 touch?** Spell it out. If the answer is more than "one new implementation, one registry entry, its tests", the seam is in the wrong place.
7. **Where does it get faked in tests?** Decide it now. A seam that can't be faked cleanly is the wrong seam.

## Choose the approach, don't default to one

For each new seam:

1. **Name the forces.** What varies, what stays fixed, what state is involved, who calls it and how often, how it is tested.
2. **List two or three candidate approaches** that fit those forces, with the trade-off of each in one line.
3. **Recommend one and say why.** For a new seam (a contract, a shared client, a registry), present the options to the user and let them pick before building. For a seam the repo already has, follow it without asking.

Typical fits (a starting point, not a lookup table):

| Force                                                                           | Candidates                                                                                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Same operations, different implementation                                       | An interface (the contract) + a typed registry of implementations (strategy pattern), one adapter per variant             |
| Variants differ only in data (URLs, flags, scopes)                              | One shared builder function + a config object per variant                                                                 |
| Many optional settings, built in steps or conditionally, reused half-configured | A builder (fluent methods, generic over response and params). A typed options object if everything is known at once       |
| Every call passes through the same steps (auth, retry, error mapping)           | One shared client that handles those steps, with per-variant hooks (base URL, error parsing), plus typed endpoint helpers  |
| Lifecycle with legal transitions (sync run, job, connection status)             | A discriminated-union state type + one transition function                                                                |
| Construction needs runtime dependencies                                         | A factory function taking an options object                                                                               |

**Builder vs options object.** An options object is simpler and the compiler checks it in one literal, so it wins when everything is known at the call site. A builder earns its place when construction is stepwise or conditional, when a half-built request is reused, or when each step narrows the type.

## Registries

Map variant ids to implementations with a typed `Record`, not a `switch` or `if/else`:

```ts
export const providerIdSchema = z.enum(['google', 'microsoft']);
export type ProviderId = z.infer<typeof providerIdSchema>;

const PROVIDERS: Record<ProviderId, StorageProvider> = {
  google: googleStorageProvider,
  microsoft: microsoftStorageProvider,
};
```

- **Why:** adding an id to the enum without an implementation fails type-checking. A `switch` with `default: throw` only fails at runtime. An `if/else` with a fallback branch silently picks the wrong variant.
- The zod enum is the single source of ids, so the same list validates input at the API boundary.
- When implementations need runtime input, the values are factories: `Record<ProviderId, (options: CreateOptions) => StorageProvider>`.
- Use `satisfies Record<ProviderId, X>` instead of a type annotation when callers need each entry's narrow type.
- Any `switch` over the same union ends with `value satisfies never`, so a new id breaks the build there too.

## Dependencies without a DI container

Wiring stays explicit:

- **Module-level singletons** for things that exist once per process: config, database client, logger, registries.
- **Per-request dependencies are passed as arguments**, preferably as narrow functions rather than whole services: `getAccessToken: () => Promise<string>`, not a token service instance.
- **Factories take an options object**: `createStorageProvider({ getAccessToken })`. That object is the injection point, and tests pass fakes through it.
- **Use cases are `fn(args, deps)`.** `args` is the input data. `deps` is a named interface of narrow functions (`saveFile`, `getAccessToken`). The service that calls the use case is the only place that picks concrete implementations.
- **Never** use a service locator, a global mutable registry filled at startup, or decorators that wire things by reflection.

## Functions or classes

Pick per case:

- **Variants differ only in data**: one shared builder function plus a config object per variant. No class.
- **Variants differ in behaviour and carry state across many methods** (a token getter, a client, a cursor): a class that `implements` the contract interface, exported through a `createX()` factory function.
- **Stateless single operation**: a plain function that satisfies a function type.
- **Abstract base classes**: only when two or more implementations share real behaviour that isn't just data. Prefer composition (a shared helper passed in) over inheritance. Never more than one level deep.

Whichever you pick, callers only see the interface type, never the concrete class.

## Guardrails

- **One definition, one adapter per consumer.** No wrapper-on-wrapper layers, no helpers that only rename or re-export.
- **No new workspace package by default.** Name the existing package and folder the code belongs in first. A new package needs a reason: a different runtime, different dependencies, or a split between browser-safe and server-only code.
- **Contract types are variant-neutral.** No vendor names in contract types or field names. A field that only makes sense for one variant belongs in that implementation.
- **No `any`.** Options get named types per variant, or a discriminated union keyed by the variant id.

## Public names are decisions

New packages, subpaths, exported contract types, registries, DB tables and columns, and API fields are hard to rename once other code depends on them. Treat each one like a seam:

- Follow the Naming rules of the clean-code skill and the terms in [`specs/glossary.md`](../../../specs/glossary.md).
- Propose two or three candidates with one line each: what a reader takes it for at the import site, and which existing names it could be mistaken for.
- Recommend one, and let the user pick before building. Names inside a single file stay your call.

## In the design doc

Every design with variants has an `## Extension points` section:

- The variation axis and the contract name.
- Known variants, with the issue that names each one.
- The exact steps to add the next one.
- Where each layer is faked in tests.
- Packages considered, and the dependency-choice outcome.
- What is deliberately _not_ abstracted, and why.

## Before finishing

- Could someone add the next known variant without touching existing variants or callers?
- Is any abstraction there only for a speculative variant? Remove it.
- Does type-checking fail if a variant id has no implementation?
- Were two or three approaches weighed, and did the user pick for a new seam?
- Did the user pick every new public name, and is each new domain term in the glossary?
