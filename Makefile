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
