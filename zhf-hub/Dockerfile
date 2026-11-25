# ZHF Hub — production container (Azure App Service / Container Apps, Render, Fly, any Docker host)
#   docker build -t zhf-hub .
#   docker run -p 3000:3000 --env-file .env.production zhf-hub
# The schema is applied separately: `npm run db:deploy` with the production DATABASE_URL.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Any postgres URL makes the build target PostgreSQL; the real one is supplied at runtime.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_STANDALONE=1
RUN npm run build

FROM base AS run
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
