# Self-hosting

Reference doc, not a PRD: no `Status:` line.

This guide runs RAGNA Studio on your own server, behind your own domains. For a quick local try-out, jump to [Localhost and Mac](#localhost-and-mac).

## Requirements

- One Linux VM with Docker and Docker Compose. Images are multi-arch (amd64, arm64).
- About 8 GB RAM.
- Two DNS records pointing at the VM.
- Two S3-compatible buckets.
- One OAuth app (Google or Microsoft).
- At least one LLM API key.

Postgres 18 with pgvector and Redis ship in the compose file.

## Domains

Use two hosts. The single-domain layout is not supported.

| Host | Service | Container port |
| --- | --- | --- |
| `app.example.com` | frontend | 3000 |
| `api.example.com` | backend | 3010 |

Set these in `.env`:

```bash
APP_URL="https://app.example.com"
API_BASE_URL="https://api.example.com"
NUXT_PUBLIC_API_BASE_URL="https://api.example.com"
TRUSTED_ORIGINS="https://app.example.com"
COOKIE_DOMAIN=".example.com"
```

- `NUXT_PUBLIC_API_BASE_URL` must be the public **https** API URL. The frontend derives the `wss://` WebSocket URL from it.
- `COOKIE_DOMAIN` is the parent domain. It is needed because app and api are separate hosts.
- `TRUSTED_ORIGINS` is a comma-separated list of allowed origins.

## Secrets

Generate these values yourself:

```bash
openssl rand -base64 32
```

- `BETTER_AUTH_SECRET`
- `ENCRYPTION_PASSWORD` (at least 16 characters, enforced at startup)
- `DB_PASSWORD`
- `REDIS_PASSWORD`

Provider credentials come from the providers. That means API keys, OAuth client secrets and S3 keys. Don't generate those.

> **Warning:** never change `BETTER_AUTH_SECRET` after the first start. Stored OAuth tokens become unreadable. That affects connected Gmail, Outlook and LinkedIn accounts. Every session also ends.

Set `ENCRYPTION_PASSWORD` once and keep it.

## Storage

Create two buckets: one for images and one for documents. Only the images bucket is public-read. Keep the documents bucket private.

| Var | Meaning |
| --- | --- |
| `S3_ENDPOINT` | Endpoint of your S3 provider |
| `S3_REGION` | Optional, default `auto`. R2 wants `auto`. AWS needs the bucket's real region. |
| `S3_ACCESS_KEY_ID` | Access key |
| `S3_SECRET_ACCESS_KEY` | Secret key |
| `S3_IMAGES_BUCKET_NAME` | Public-read bucket for images and generated media |
| `S3_DOCUMENTS_BUCKET_NAME` | Private bucket for documents |
| `MEDIA_URL` | Public base URL of the images bucket |
| `NUXT_PUBLIC_MEDIA_URL` | Same value as `MEDIA_URL`, for the frontend CSP |

If `MEDIA_URL` is missing, the backend and worker log a startup warning and media has no host.

### Cloudflare R2

The endpoint is `https://<account-id>.r2.cloudflarestorage.com`. For a jurisdiction such as `eu`, use `https://<account-id>.eu.r2.cloudflarestorage.com`.

```bash
S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
S3_REGION="auto"
S3_IMAGES_BUCKET_NAME="studio-images"
S3_DOCUMENTS_BUCKET_NAME="studio-documents"
MEDIA_URL="https://images.example.com"
NUXT_PUBLIC_MEDIA_URL="https://images.example.com"
```

Attach a custom domain to the images bucket and use it as `MEDIA_URL`.

### AWS S3

Use the regional endpoint and set the bucket's real region.

```bash
S3_ENDPOINT="https://s3.eu-central-1.amazonaws.com"
S3_REGION="eu-central-1"
S3_IMAGES_BUCKET_NAME="studio-images"
S3_DOCUMENTS_BUCKET_NAME="studio-documents"
MEDIA_URL="https://studio-images.s3.eu-central-1.amazonaws.com"
NUXT_PUBLIC_MEDIA_URL="https://studio-images.s3.eu-central-1.amazonaws.com"
```

The images bucket must allow public reads. A CDN such as CloudFront in front of it also works. Use its URL as `MEDIA_URL`.

### Other S3-compatible servers

Any S3-compatible server works, including one on localhost. Running it is up to you. We don't ship or support one.

## OAuth

Sign-in uses OAuth. Configure at least one provider: Google (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) or Microsoft (`MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`).

The redirect URI per provider is:

```
https://api.example.com/auth/callback/<provider>
```

Use `google`, `microsoft` or `linkedin` as `<provider>`. LinkedIn is not a sign-in option here. Use it only to publish drafts.

## Start

```bash
cp .env.example .env
# edit .env: domains, secrets, storage, one OAuth provider, one AI key
make up
```

`make up` runs the base compose file plus `docker/docker-compose.selfhost.yml`. This override sets the in-network hosts for Postgres, Redis and the webbrowser. It overrides the `localhost` values from `.env.example`.

The stack starts in order:

1. Postgres and Redis come up.
2. `migrate` applies the schema.
3. `seed` adds the model catalog and the default agent.
4. The backend, worker, frontend and webbrowser start.

`migrate` and `seed` run once per start and are idempotent.

The frontend and backend listen on `127.0.0.1` only (ports 3000 and 3010). Put a reverse proxy in front of them. Stop the stack with `make down`.

The state you own is Postgres, Redis and both buckets. Backups are up to you.

## Reverse proxy

Caddy gets TLS certificates automatically. It proxies WebSockets without extra config, so live features work out of the box.

```
app.example.com {
	reverse_proxy 127.0.0.1:3000
}

api.example.com {
	reverse_proxy 127.0.0.1:3010
}
```

Point both DNS records at the VM and open ports 80 and 443. Other proxies work too. They must pass the WebSocket upgrade for the API.

## Restricting sign-up

By default everyone who can reach the app and has an account at your OAuth provider can sign in. Restrict it with a comma-separated list:

```bash
ALLOWED_LOGIN_EMAILS="you@example.com,teammate@example.com"
```

An empty value allows everyone.

## Images Upgrades

Docker images use the `:latest` tag.

```bash
docker compose --project-directory . -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml pull
make up
```

Migrations run automatically and only go forward.

## Optional providers

Each is enabled by its own env vars.

- An OpenAI key for embeddings, which power retrieval over large knowledge bases
- A Black Forest Labs key for FLUX images and video, or Google Vertex for Imagen and Veo
- A SerpAPI key for web search
- Google or Microsoft OAuth with mail scopes for the email client
- A LinkedIn app for publishing drafts
- SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`). Only the verify and welcome emails need it.
- An email allowlist (`ALLOWED_LOGIN_EMAILS`), see above

Stripe and credits are off by default (`CREDITS_ENABLED="false"`).

### Language base URL

Set `NUXT_PUBLIC_I18N_BASE_URL` to your app URL, for example `https://app.example.com`. It replaces the default `https://ragna.io` used for language links.

## Localhost and Mac

For a local try-out use the dev compose. It needs no proxy and no TLS.

```bash
cp .env.example .env          # fill in secrets, storage, one OAuth provider, and one AI key
make up-dev-full              # starts the whole stack with all ports published
```

Open [localhost:3000](http://localhost:3000). The API is on port 3010. Storage works as described in [Storage](#storage).

The dev compose publishes every port, including Postgres and Redis. Do not use it on a public server.
