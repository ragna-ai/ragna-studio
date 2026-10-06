.PHONY: dev build build-core build-all \
        up down \
        up-dev down-dev \
        up-dev-full down-dev-full \
        help

# ── Local dev (hot-reload, no Docker) ────────────────────────────────────────
dev:
	pnpm turbo dev

build:
	./scripts/build.sh

build-core:
	./scripts/build-backend.sh && ./scripts/build-frontend.sh && ./scripts/build-worker.sh && ./scripts/build-migrate.sh

build-all:
	./scripts/build-backend.sh && ./scripts/build-frontend.sh && ./scripts/build-worker.sh && ./scripts/build-webbrowser.sh && ./scripts/build-migrate.sh

# ── Docker (self-host compose) ───────────────────────────────────────────────
up:
	docker compose --project-directory . -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml up -d

down:
	docker compose --project-directory . -f docker/docker-compose.yml -f docker/docker-compose.selfhost.yml down

# ── Docker (dev compose) ─────────────────────────────────────────────────────
up-dev:
	docker compose --project-directory . -f docker/docker-compose.yml -f docker/docker-compose.dev.yml up -d

up-dev-full:
	docker compose --project-directory . -f docker/docker-compose.yml -f docker/docker-compose.dev.yml --profile "full" up -d

down-dev:
	docker compose --project-directory . -f docker/docker-compose.yml -f docker/docker-compose.dev.yml down

# ── Help ─────────────────────────────────────────────────────────────────────
help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  dev                Run the application in local development mode (hot-reload, no Docker)"
	@echo "  build              Build the application"
	@echo "  build-core         Build the core components (Backend, Frontend, Worker)"
	@echo "  build-all          Build all components (Backend, Frontend, Worker, Webbrowser)"
	@echo "  up                 Start the self-hosted application using Docker Compose"
	@echo "  down               Stop the self-hosted application using Docker Compose"
	@echo "  up-dev             Start the application in development mode using Docker Compose"
	@echo "  up-dev-full        Start the application in full development mode using Docker Compose"
	@echo "  down-dev           Stop the application in development mode using Docker Compose"