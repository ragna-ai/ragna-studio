# Contributing to RAGNA Studio

Thanks for your interest in contributing.

## Before you start

- For anything larger than a small fix, [open an issue](https://github.com/ragna-ai/ragna-studio/issues/new/choose) first. We will tell you if it fits the roadmap.
- Small fixes (typos, docs, clear bugs) can go straight to a pull request.
- Report security issues privately. See [SECURITY.md](SECURITY.md).
- By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Local setup

Follow [specs/development.md](specs/development.md) to run the stack from source. Login uses OAuth, so configure at least one provider in `.env`.

The repo is a pnpm and Turborepo monorepo. See [specs/architecture.md](specs/architecture.md) for the layout and [specs/](specs/README.md) for design docs and PRDs.

## Making a change

1. Fork the repo and create a branch from `main`.
2. Make your change. Keep it focused on one thing.
3. Run the checks:

   ```bash
   pnpm lint
   pnpm check-types
   pnpm test:api      # if you touched apps/api
   ```

4. Push your branch and open a pull request against `main`.

`main` is protected. Every change goes through a pull request.

After you edit a package in `packages/`, rebuild it: `pnpm --filter @repo/<pkg> build`.

## Code style

- Formatting uses oxfmt with single quotes. Linting uses oxlint.
- TypeScript only. `as any` is not allowed.
- Keep comments short. Explain why, not what.
- Controllers stay thin. Put logic in services.
- New database tables need a Drizzle migration (`pnpm --filter @repo/database db:generate`). Register them in `packages/database/src/schema/relations.ts` too.
- Do not hand-write migration SQL.

## Pull requests

- Use a clear title. We follow the `type: summary` style, for example `fix: handle empty dataset export`.
- Describe what changed and why.
- Link the issue it closes.
- Add or update tests when you change behavior.
- Add screenshots for UI changes.

A maintainer will review your PR. We may ask for changes.

## License

RAGNA Studio is licensed under [AGPL-3.0](LICENSE). By submitting a contribution, you agree that it is licensed under the same terms.
