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

# Roster PDF must not depend on an external font CDN at runtime.
# Install a Japanese TrueType font in the image and seed the exact cache path
# used by server/pdfRoster.ts so ensureFont() succeeds locally even if the
# external CDN is blocked (HTTP 403) or the server has no outbound network.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-ipafont-gothic \
  && cp /usr/share/fonts/opentype/ipafont-gothic/ipag.ttf /tmp/NotoSansJP-Roster-v2.ttf \
  && chmod 0644 /tmp/NotoSansJP-Roster-v2.ttf \
  && rm -rf /var/lib/apt/lists/*

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
