.PHONY: dev build build-core build-all \
        up-prod down-prod \
        up-dev down-dev \
        up-dev-full down-dev-full \
        help

# ── Local dev (hot-reload, no Docker) ────────────────────────────────────────
dev:
	pnpm turbo dev

build:
	./scripts/build.sh

build-core:
	./scripts/build-api.sh && ./scripts/build-webapp.sh && ./scripts/build-worker.sh

build-all:
	./scripts/build-api.sh && ./scripts/build-webapp.sh && ./scripts/build-worker.sh && ./scripts/build-webbrowser.sh

# ── Docker (production compose) ──────────────────────────────────────────────
up-prod:
	docker compose -f docker-compose.yml -f docker-compose.production.yml up -d

down-prod:
	docker compose down

# ── Docker (dev compose) ─────────────────────────────────────────────────────
up-dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

up-dev-full:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml --profile "full" up -d

down-dev:
	docker compose down

# ── Help ─────────────────────────────────────────────────────────────────────
help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "Targets:"
	@echo "  dev                Run the application in local development mode (hot-reload, no Docker)"
	@echo "  build              Build the application"
	@echo "  build-core         Build the core components (API, Webapp, Worker)"
	@echo "  build-all          Build all components (API, Webapp, Worker, Webbrowser)"
	@echo "  up-prod            Start the application in production mode using Docker Compose"
	@echo "  down-prod          Stop the application in production mode using Docker Compose"
	@echo "  up-dev             Start the application in development mode using Docker Compose"
	@echo "  up-dev-full        Start the application in full development mode using Docker Compose"
	@echo "  down-dev           Stop the application in development mode using Docker Compose"