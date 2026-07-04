# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

ARG VITE_APP_ID
ENV VITE_APP_ID=$VITE_APP_ID

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle ./drizzle
COPY scripts/migrate.mjs scripts/seed-owner.mjs ./scripts/
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
