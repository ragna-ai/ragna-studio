# Ragna Studio

## Purpose and status

A personal showcase project: it demonstrates AI capabilities (agents, chat, workflows, image generation) and the author's engineering skills. It currently has a single user, the author. Whether it ever ships to real production is open.

Consequences for decisions in this repo:

- No backward compatibility concerns. Breaking schema or API changes are fine.
- Clean architecture is non-negotiable; it is part of what the project showcases.
- Production concerns like quotas, billing, and multi-tenancy follow a "design for it, ship it later" rule: designs must not paint the app into a corner on these, but building them is deferred until needed.
- External-service constraints that only bite at scale or on public launch (e.g. OAuth app verification for restricted scopes) can be deferred: testing-mode limits are acceptable.

## Usage

pnpm gen package # interactive
pnpm gen package --args my-pkg "desc" # non-interactive

## R2 buckets

Bucket names configured via env vars (e.g. `CF_DOCUMENTS_BUCKET_NAME`) use a
"bucket ref" convention so a bucket created outside Cloudflare R2's default
data-residency jurisdiction still resolves to the right S3 API endpoint:

- A leading `eu-` prefix selects the EU jurisdiction endpoint; the prefix is
  stripped to get the real bucket name (`eu-ragna-studio-documents` →
  bucket `ragna-studio-documents` in the EU jurisdiction).
- No prefix means the default jurisdiction, and the value is used as-is.

Example: `CF_DOCUMENTS_BUCKET_NAME=eu-ragna-studio-documents`.

Caveat: a bucket whose real name itself starts with `eu-` can't be expressed
with this convention — it would be read as an EU-jurisdiction bucket named
without that prefix. See `packages/storage/src/lib/bucket-ref.ts`.
