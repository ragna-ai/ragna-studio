---
name: clean-code
description: Apply when writing or changing code in this repo. Produces clean, human-readable, maintainable code that a junior can follow. Use for any edit, refactor, or new feature.
---

Write code the next person can read and change without asking you. Assume that person is a junior.

## Rules

1. **Name for intent.** Variables, functions, files say what they do. No `data`, `tmp`, `handle2`. A good name removes the need for a comment.
2. **Small, single-purpose functions.** One job each. If you need "and" to describe it, split it.
3. **Match the surrounding code.** Copy the file's existing naming, structure, and idioms. Consistency beats personal preference.
4. **Same knowledge, one place (DRY).** Deduplicate real shared knowledge (a schema, a constant, a rule). Do NOT merge code that only *looks* similar but changes for different reasons.
5. **Prefer boring (KISS).** Pick the obvious solution over the clever one. No abstraction layer with a single user.
6. **Don't build for "later" (YAGNI).** Solve the current requirement. Add flexibility when a second real case shows up.
7. **Validate at the boundary.** Parse and check external input (request, env, third-party response) before using it.
8. **Handle the unhappy path.** Loading, empty, and error states. Don't swallow errors silently.
9. **Comment *why*, not *what*.** The code shows what. A comment explains a non-obvious reason or trade-off. Delete comments that just restate the line.
10. **Leave it cleaner.** Remove dead code, unused imports, and stray console logs you touch.
11. **Early returns.** Guard invalid cases up front and return. Avoid deep `if/else` nesting; keep the happy path at the left margin.

## TypeScript

1. **No `any`.** Use a real type, a generic, or `unknown` + a narrowing check. Avoid `as` casts; if you must, comment why.
2. **Name your types.** Define named `type`/`interface` for object shapes and reuse them. No inline object types in function signatures or props.
3. **Infer return types for simple functions; annotate public/exported ones.** A reader should see the contract without running the code.
4. **Parse, don't assume.** Validate external data with Zod (already used here) and derive the type with `z.infer`. Don't hand-write a type that can drift from the schema.
5. **Prefer `type` unions and discriminated unions** over enums or loose strings for fixed sets of values.
6. **Make illegal states unrepresentable.** Use unions/optional fields so bad combinations don't typecheck, instead of guarding at runtime.
7. **`readonly` and `const` by default.** Mutate only when needed.
8. **No non-null `!`.** Narrow with a check or early return instead.

## Vue / Nuxt

1. **`<script setup lang="ts">` + Composition API.** No Options API in new code. Order the block using the section comments in `reference.vue` (Imports → Props → Emits → Refs → Composables → Computed → Functions → Hooks). Keep those comment headers in the file.
2. **Type props and emits.** Use `defineProps<...>()` / `defineEmits<...>()` with a named type, with `withDefaults` for optional props. No untyped props.
3. **Build small, reusable components.** If markup repeats or a template grows past one screen, extract a focused child component. One component, one responsibility.
4. **Extract logic into composables.** Reusable or stateful logic goes in `useX()` composables, not copied between components. Keep templates thin.
5. **Reuse existing UI.** Compose from existing components before building new ones (see shadcn-vue section).
6. **Props down, events up.** Don't mutate props. Use `defineModel` for two-way binding instead of manual prop + emit.
7. **`computed` over methods** for derived state. Keep watchers for side effects only.
8. **Forms = TanStack Form + Zod** (repo standard). Share the Zod schema with the backend; don't re-validate by hand.
9. **Stable `:key` in lists.** Use a real id, never the array index.

## shadcn-vue

1. **Use shadcn components first.** For any standard UI element (button, input, dialog, alert, dropdown, etc.) use the shadcn-vue component from `app/components/ui/`. No raw `<button>`/`<input>` or hand-rolled equivalents when a shadcn one exists.
2. **Missing component? Add it, don't rebuild it.** Run `npx shadcn-vue@latest add <component>` from `apps/web/`, then use it. Don't copy markup from another component to fake it.
3. **Use variants, not custom styles.** Reach for the component's props (`variant`, `size`, etc.) before adding classes. Extend variants in the component's `cva` config rather than overriding with one-off Tailwind.
4. **Compose, don't fork.** Build app-specific components by wrapping shadcn primitives. Don't edit the generated `ui/` files except to add shared variants.
5. **Style with `cn()` + Tailwind tokens.** Merge classes via the `cn()` helper and use the theme tokens (stone base), not hard-coded colors.

## Before finishing

- Would a junior understand this without you in the room?
- Can each function be described in one sentence?
- Any duplication that is the *same knowledge*? Any abstraction with one user?
- Tests/types/lint still green (`pnpm check-types`, `pnpm lint`).

Keep explanation to the user short. Show the code, not an essay.
