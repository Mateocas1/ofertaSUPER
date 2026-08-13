# syntax=docker/dockerfile:1
FROM node:22.19.0-bookworm-slim AS openssl-node
RUN apt-get update \
    && apt-get install --yes --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM openssl-node AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM dependencies AS builder
COPY prisma ./prisma
RUN npm run db:generate
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM dependencies AS migrator
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM dependencies AS job-dependencies
COPY prisma ./prisma
RUN npm run db:generate \
    && npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    # Optional peer metadata can retain build tools after pruning.
    && rm -rf node_modules/prisma node_modules/typescript node_modules/eslint \
    && rm -f node_modules/.bin/prisma node_modules/.bin/tsc \
        node_modules/.bin/tsserver node_modules/.bin/eslint

FROM openssl-node AS job
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd --system --gid 1001 ingestion \
    && useradd --system --uid 1001 --gid ingestion ingestion
COPY --from=job-dependencies --chown=ingestion:ingestion /app/node_modules ./node_modules
COPY --chown=ingestion:ingestion package.json ./package.json
COPY --chown=ingestion:ingestion scripts ./scripts
COPY --chown=ingestion:ingestion src ./src
COPY --chown=ingestion:ingestion tsconfig.json ./tsconfig.json
USER ingestion
CMD ["./node_modules/.bin/tsx", "scripts/ingest.ts"]

FROM node:22.19.0-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --system --gid 1001 nextjs \
    && useradd --system --uid 1001 --gid nextjs nextjs \
    && mkdir -p .next/cache \
    && chown -R nextjs:nextjs .next
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server.js"]
