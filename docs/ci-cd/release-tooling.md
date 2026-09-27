# Release tooling

> **Status: proposed** (2026-09-27). Recommendation: adopt release-it in a
> follow-up PR, after the CI/CD workflows ([prd.md](./prd.md)) are green and
> the first manual tag `v0.3.0` has tested the image pipeline.

Today a release is a manual tag (`git tag v0.3.0 && git push origin v0.3.0`),
which triggers `release.yml`. There is no changelog and no GitHub Release.
This doc compares tools that would automate the version bump, changelog,
and GitHub Release.

## Constraints

- Monorepo of apps. All 21 packages are `private`; nothing is published to npm.
- The git tag is the only version ([prd.md, Versioning](./prd.md#versioning)).
- Tag pushes build the images (`release.yml`).
- Solo developer, occasional releases, wants control over when and what.

## Options

| Tool | How it works | Fit |
| --- | --- | --- |
| **release-it** | Local CLI. Suggests the next version from commits, writes `CHANGELOG.md` and the root `package.json` version, commits, tags, pushes, creates the GitHub Release. Interactive. | **Best.** `release.yml` stays unchanged. |
| **release-please** | GitHub Action. Keeps a release PR open that accumulates the next version and changelog; merging it tags and releases. | **Good.** No npm dependency, fits a PR-only flow. Needs a restructure of `release.yml` (see below). |
| **Changesets** | Each PR adds a changeset file with bump type and note. | **Poor.** Built for npm publishing. Changesets 3 skips private packages by default, silently. Extra work per PR. |
| **semantic-release** | Fully automatic release on every merge, no human checkpoint. | **Poor.** npm-publishing focus; monorepo support comes from a community plugin. |
| **`pnpm version -r`** | pnpm built-in. | **Broken.** Known bug: private packages are not bumped (pnpm#13736). |

### release-it vs release-please

| | release-it | release-please |
| --- | --- | --- |
| Runs | locally, on demand | on GitHub, after every merge to `main` |
| Control | pick the version interactively | always-open release PR, release on merge |
| `release.yml` | unchanged: a locally pushed tag triggers it | tags created with `GITHUB_TOKEN` don't trigger other workflows; the image build has to move into the release-please workflow (or use a PAT) |
| Dependencies | `release-it` + `@release-it/conventional-changelog` as root devDependencies (~20 transitive) | none (action only) |
| Catch | pushes the release commit directly to `main` | release PR noise |

## Commit convention

Both release-it (with the conventional-changelog plugin) and release-please
derive the bump from Conventional Commits. 173 of the last 179 commits on
`main` already follow it. **37 use `enh:`**, which isn't a standard type and
wouldn't count as a feature. Either map `enh` to an "Enhancements" changelog
section in the config, or use `feat:` from now on.

## Recommendation

**release-it**, for these reasons:

- The existing tag-triggered `release.yml` works as-is.
- Releases happen when Sven decides, with an interactive version prompt.
- No permanently open release PR.

Setup sketch for the follow-up PR:

- Root devDependencies: `release-it`, `@release-it/conventional-changelog`.
- `.release-it.json`: `npm.publish: false`, `git.tagName: "v${version}"`,
  `github.release: true`, plugin with `preset: conventionalcommits` and
  `enh` mapped to an "Enhancements" section, `infile: CHANGELOG.md`.
- Root script: `"release": "release-it"`. GitHub auth via
  `GITHUB_TOKEN=$(gh auth token) pnpm release`, or `github.web: true` to open
  a pre-filled release page instead.
- First run bumps to `0.3.0` (root `package.json` gets a `version` field).

**Branch protection:** if `main` later requires PRs, allow admin bypass so
the release commit can be pushed. Branch protection on private repos isn't
available on GitHub Free anyway.

## Sources

- [release-it](https://github.com/release-it/release-it) (v21.1.0, 2026-09-17)
- [release-please-action](https://github.com/googleapis/release-please-action)
- [Semantic Release vs Release Please vs Changesets](https://oleksiipopov.com/blog/npm-release-automation/)
- [Changesets: versioning apps](https://github.com/changesets/changesets/blob/main/docs/versioning-apps.md)
- [Changesets 3 private-package default](https://github.com/EliRobinson/react-native-template/pull/3)
- [pnpm#13736](https://github.com/pnpm/pnpm/issues/13736)
