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

# PDF generation must not depend on the external Japanese-font CDN at runtime.
# The app's PDF generators currently expect these exact /tmp cache filenames:
# - pdfRoster.ts     -> NotoSansJP-Roster-v2.ttf
# - pdfAttendance.ts -> NotoSansJP-Regular.ttf / NotoSansJP-Bold.ttf
# - pdfWorkReport.ts -> NotoSansJP-Regular.ttf
# Seed every cache path from the locally installed IPA Gothic font so PDFKit
# always receives a real TrueType font even when the CDN is blocked (HTTP 403)
# or outbound network access is unavailable.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-ipafont-gothic \
  && cp /usr/share/fonts/opentype/ipafont-gothic/ipag.ttf /tmp/NotoSansJP-Roster-v2.ttf \
  && cp /usr/share/fonts/opentype/ipafont-gothic/ipag.ttf /tmp/NotoSansJP-Regular.ttf \
  && cp /usr/share/fonts/opentype/ipafont-gothic/ipag.ttf /tmp/NotoSansJP-Bold.ttf \
  && chmod 0644 /tmp/NotoSansJP-Roster-v2.ttf /tmp/NotoSansJP-Regular.ttf /tmp/NotoSansJP-Bold.ttf \
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
