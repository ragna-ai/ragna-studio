# Dev compose project name

Since 2026-10-08 the dev stack (`make up-dev`, `docker-compose.dev.yml`) runs
as Compose project **`ragna_studio_dev`** with its own network
`ragna_studio_dev_network` and its own container names
(`ragna_studio_dev_postgresql`, `ragna_studio_dev_redis`). Self-host installs
and prod stay `ragna_studio`. The dev containers and a self-host test install
can run side by side: dev publishes `DB_PORT`/`REDIS_PORT` from `.env`,
self-host only 3000 and 3010. Stop `pnpm dev` first, though, since it uses
3000 and 3010 as well.

## Why

Both stacks used to share the project name `ragna_studio`, and with it the
volume names (`ragna_studio_postgres_data`, `ragna_studio_redis_data`). A
`docker compose -p ragna_studio down -v` for a self-host test install deleted
the dev database on the same machine, and the installer counted dev data as
an existing install.

The container names were shared as well, so the installer failed with
"container name already in use" while dev was running. Dev only runs
`postgres` and `redis`, so the dev override renames just those two.
`pnpm --filter @repo/database db:backup` defaults to the dev container.

## One-time migration of existing dev data

After pulling this change, `make up-dev` starts with empty volumes. To keep
your dev data, copy it once:

```bash
# 1. Stop the old dev stack. Keeps the volumes, removes the old network.
docker compose -p ragna_studio down

# 2. Copy both volumes into the new names (labels keep Compose from warning)
for volume in postgres_data redis_data; do
  docker volume create \
    --label com.docker.compose.project=ragna_studio_dev \
    --label com.docker.compose.volume=$volume \
    ragna_studio_dev_$volume
  docker run --rm \
    -v ragna_studio_$volume:/from:ro \
    -v ragna_studio_dev_$volume:/to \
    alpine sh -c 'cp -a /from/. /to/'
done

# 3. Start dev on the new project
make up-dev
```

Once dev works, remove the old volumes. Only do this if no self-host test
install on this machine uses them:

```bash
docker volume rm ragna_studio_postgres_data ragna_studio_redis_data
```

If your dev data is disposable, skip step 2. After `make up-dev`, set up the
empty database instead:

```bash
pnpm --filter @repo/database db:push
pnpm --filter @repo/database db:seed
pnpm --filter @repo/api test:setup
```
