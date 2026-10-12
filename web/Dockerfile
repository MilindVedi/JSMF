# Build context is the REPO ROOT, not web/ — web is an npm workspace that
# depends on packages/core (@jsmf/core), and both install from the one root
# package-lock.json. Build with:
#   docker build -f web/Dockerfile .
# What reaches the context is limited by web/Dockerfile.dockerignore.
FROM node:20-alpine AS build
WORKDIR /app

# Manifests first, so the install layer stays cached until a dependency
# changes. Only the web workspace (and what it links: @jsmf/core) is
# installed; backend/, main-web/ and pdf-web/ are not workspaces at all.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY web/package.json web/
RUN npm ci --workspace web --include-workspace-root

COPY packages/core packages/core
COPY web web
# Inlined into the client bundle by `next build`, so it must be set here, not
# on the Cloud Run service. Unset, the app silently falls back to mock data.
ARG NEXT_PUBLIC_DATA_SOURCE=api
ENV NEXT_PUBLIC_DATA_SOURCE=$NEXT_PUBLIC_DATA_SOURCE
RUN npm run build --workspace web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# `output: "standalone"` in next.config.ts traces only the dependencies this
# app actually uses, so the runtime image needs no node_modules install step.
# Tracing starts at the repo root (outputFileTracingRoot), so the standalone
# tree mirrors the repo: the server is web/server.js, and static assets and
# public/ go next to it under web/.
COPY --from=build /app/web/.next/standalone ./
COPY --from=build /app/web/.next/static ./web/.next/static
COPY --from=build /app/web/public ./web/public

ENV PORT=3003
ENV HOSTNAME=0.0.0.0
EXPOSE 3003
CMD ["node", "web/server.js"]
