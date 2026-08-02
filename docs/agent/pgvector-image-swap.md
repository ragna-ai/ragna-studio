# Postgres → pgvector image swap

One-time infra step for [agent-context-retrieval.md](./agent-context-retrieval.md).
Swaps `postgres:18.4-alpine3.24` for the pgvector image. The data volume
carries over (same pg major). The image is Debian-based (pgvector publishes
no alpine tags), so the swap moves from musl to glibc: text collation
changes, and every btree index on text columns must be rebuilt once.
Skipping the REINDEX risks silently wrong query results, not errors.

## 1. Backup

```bash
docker exec ragna_studio_postgresql sh -c \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > backup-pre-pgvector.sql
```

## 2. Stop everything that talks to the DB

Dev: stop `pnpm dev` (api + worker). If the compose prod profile is
running: `docker compose stop api worker webapp`.

## 3. Swap the image

In `docker-compose.yml`:

```yaml
# before
image: postgres:18.4-alpine3.24
# after
image: pgvector/pgvector:0.8.6-pg18-trixie
```

```bash
docker compose up -d postgres
```

The container recreates on the existing `postgres_data` volume.

## 4. Reindex, record collation version, create extension

```bash
docker exec ragna_studio_postgresql sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "REINDEX DATABASE;" \
     -c "UPDATE pg_database SET datcollversion = pg_database_collation_actual_version(oid);" \
     -c "CREATE EXTENSION IF NOT EXISTS vector;"'
```

The catalog UPDATE (instead of the usual `ALTER DATABASE ... REFRESH
COLLATION VERSION`) is deliberate: the musl cluster recorded no collation
version at all (`datcollversion` is NULL), and Postgres rejects a
NULL-to-value refresh with `ERROR: invalid collation version change`.
Recording the glibc version directly is safe exactly here, right after the
REINDEX, and makes future glibc upgrades in the image warn properly. It
also covers all databases in the cluster at once (templates and
`studio_test` included).

## 5. Verify

```bash
docker exec ragna_studio_postgresql sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
     -c "SELECT version();" \
     -c "SELECT datname, datcollversion FROM pg_database;" \
     -c "SELECT extversion FROM pg_extension WHERE extname = '\''vector'\'';" \
     -c "SELECT '\''[1,2,3]'\''::vector <=> '\''[3,2,1]'\''::vector AS cosine_distance;"'
```

Expected: `version()` mentions Debian (not musl), every `datcollversion`
is set (e.g. `2.41`, no NULLs), `extversion` is `0.8.6`, and the distance
query returns a number without error.

Then the app-level check:

```bash
pnpm dev          # api + worker come up clean, log in, click around
pnpm test:api     # integration suite against the swapped DB
```

## Production

Status: done locally 2026-08-02 (274/0 `test:api` after the swap). Prod
pending.

The production override (`docker-compose.production.yml`) does not touch
the postgres service, so prod uses the same image line, container name,
and env vars. The steps above run verbatim on the prod host. What does
NOT happen automatically: deploying the compose change recreates the
container with the new image, but nothing runs step 4. Running the new
image without the REINDEX risks silently wrong text-index queries, so both
must happen in one maintenance window:

1. Hold the `docker-compose.yml` commit until the window.
2. On the host: step 1 (backup), `docker compose stop webapp api worker`,
   pull the compose change, `docker compose pull postgres && docker
   compose up -d postgres`, then steps 4 and 5, then start the app
   services.
3. While there: `uname -m` — confirm the host is x86_64. The planned
   `@firecrawl/pdf-inspector` swap (see agent-context-documents.md) has no
   linux-arm64 build; if prod is arm64, that decision needs revisiting.

Fresh environments (empty volume) need none of this: initdb under the
glibc image records collation versions correctly, and only the extension
is required. A one-liner mounted into `/docker-entrypoint-initdb.d/`
(runs on empty data dirs only, inert on existing volumes) covers that:

```yaml
# postgres service in docker-compose.yml
volumes:
  - postgres_data:/var/lib/postgresql/data/
  - ./docker/postgres-init.sql:/docker-entrypoint-initdb.d/01-vector.sql:ro
```

```sql
-- docker/postgres-init.sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## Rollback

Revert the image line and `docker compose up -d postgres`. The volume is
still binary-compatible in both directions, but indexes were rebuilt under
glibc, so run `REINDEX DATABASE;` again after going back. If anything looks
worse than that, restore the dump from step 1 into a fresh volume.

Note: once the phase 3 schema lands (`db:push` with the vector column),
rolling back to the plain postgres image stops working; the vector type
would have no extension. Rollback is only a pre-schema option.
