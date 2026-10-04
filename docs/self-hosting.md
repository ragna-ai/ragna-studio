# Self-hosting

Reference doc, not a PRD: no `Status:` line.

## Start the stack

```bash
cp .env.example .env          # fill in secrets, storage, one OAuth provider, and one AI key
make up-dev-full              # pulls the images and starts the whole stack
```

The stack starts in order. Postgres comes up first. The `migrate` container applies the schema. The `seed` container adds the model catalog and the default agent. Then the backend, worker, frontend, and webbrowser start. Both one-shot containers are idempotent, so upgrading is just pulling newer images and starting again.

Open [localhost:3000](http://localhost:3000). Login uses OAuth, so configure at least one provider (Google, Microsoft) in `.env`.

## What you need

| Need | For |
| --- | --- |
| PostgreSQL 18 with pgvector (the compose file ships the image) | Everything |
| Redis | Queues and schedules |
| S3-compatible storage (configured for Cloudflare R2) | Files and generated media |
| One OAuth login: Google, Microsoft | Sign-in |
| At least one LLM key | Chat and agents |

## Optional pieces

Each is enabled by its own env vars.

- An OpenAI key for embeddings, which power retrieval over large knowledge bases
- A Black Forest Labs key for FLUX images and video, or Google Vertex for Imagen and Veo
- A SerpAPI key for web search
- Google or Microsoft OAuth with mail scopes for the email client
- A LinkedIn app for publishing drafts
- System ffmpeg for the AI-generated video badge
- An email allowlist (`ALLOWED_LOGIN_EMAILS`) to control who can sign in
