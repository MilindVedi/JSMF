# NEXT_PUBLIC_* variables are inlined into the client bundle at build time —
# they must be build args, not runtime env vars, or the browser bundle would
# still point at whatever URL was baked in during the image build.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ARG NEXT_PUBLIC_MAX_UPLOAD_MB=10

FROM node:20-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAX_UPLOAD_MB
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_MAX_UPLOAD_MB=$NEXT_PUBLIC_MAX_UPLOAD_MB

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# `output: "standalone"` in next.config.ts traces only the dependencies this
# app actually uses, so the runtime image needs no node_modules install step.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

ENV PORT=3001
ENV HOSTNAME=0.0.0.0
EXPOSE 3001
CMD ["node", "server.js"]
