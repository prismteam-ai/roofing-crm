# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable && apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
ARG GIT_COMMIT=unknown
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/rag/package.json packages/rag/
COPY packages/api-client/package.json packages/api-client/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
 && printf '{"commit":"%s","builtAt":"%s"}\n' "$GIT_COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > apps/api/build.json \
 && pnpm --filter @roofing/api deploy --legacy --prod /out

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=8080 WEB_DIST=/app/web FIXTURE_DIR=/app/fixtures/dataset LEADS_DB_PATH=/app/data/leads.sqlite TRACE_DIR=/app/data/traces
WORKDIR /app
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/dist ./dist
COPY --from=build /out/package.json ./package.json
COPY --from=build /repo/apps/api/build.json ./build.json
COPY --from=build /repo/apps/web/dist ./web
COPY --from=build /repo/fixtures ./fixtures
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+process.env.PORT+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
