# All Node tooling runs in a container so nothing is installed globally.
# Python work uses a project-local .venv (see `make venv`).
NODE_IMAGE ?= node:22-alpine
DOCKER_RUN = docker run --rm --user "$$(id -u):$$(id -g)" \
	-e npm_config_cache=/app/.npm-cache \
	-v "$$(pwd)":/app -w /app $(NODE_IMAGE)

.PHONY: install test typecheck build dev clean venv

install: ; $(DOCKER_RUN) npm install --no-audit --no-fund
test: ; $(DOCKER_RUN) npx vitest run
typecheck: ; $(DOCKER_RUN) npx tsc --build
build: ; $(DOCKER_RUN) npm run build
dev: ; docker run --rm -it --user "$$(id -u):$$(id -g)" -e npm_config_cache=/app/.npm-cache \
	-p 5173:5173 -v "$$(pwd)":/app -w /app $(NODE_IMAGE) npm run dev -- --host 0.0.0.0
venv:
	python3 -m venv .venv && ./.venv/bin/pip install -q --upgrade pip duckdb pyarrow requests
	@echo "venv ready: source .venv/bin/activate"
clean: ; rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/web/dist .npm-cache

# --- Cloudflare Worker (workers/agent-proxy) ---
# Auth is via CLOUDFLARE_API_TOKEN, not `wrangler login` -- the OAuth browser
# flow binds its callback listener to the container's loopback only, which
# Docker's port forwarding cannot reach. An API token is also what CI would
# use, so this is the correct headless path, not a workaround.
#
# Put it in workers/agent-proxy/.env (gitignored, never committed):
#   CLOUDFLARE_API_TOKEN=...
#   CLOUDFLARE_ACCOUNT_ID=...   (only needed if your account is ambiguous)
# or export it in your shell -- either works, .env just persists it.
WORKER_DIR = workers/agent-proxy
WORKER_ENV_FILE = $(WORKER_DIR)/.env
DOCKER_WRANGLER = docker run --rm -it \
	--user "$$(id -u):$$(id -g)" -e HOME=/tmp \
	-e npm_config_cache=/app/.npm-cache \
	-e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID \
	$(if $(wildcard $(WORKER_ENV_FILE)),--env-file $(WORKER_ENV_FILE),) \
	-v "$$(pwd)":/app -w /app/$(WORKER_DIR) $(NODE_IMAGE)

.PHONY: worker-install worker-secret worker-deploy worker-dev worker-whoami
worker-install: ; $(DOCKER_WRANGLER) npm install --no-audit --no-fund
worker-whoami:  ; $(DOCKER_WRANGLER) npx wrangler whoami
worker-secret:  ; $(DOCKER_WRANGLER) npx wrangler secret put GEMINI_API_KEY
worker-deploy:  ; $(DOCKER_WRANGLER) npx wrangler deploy
worker-dev:     ; $(DOCKER_WRANGLER) npx wrangler dev
