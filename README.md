Usage:

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
