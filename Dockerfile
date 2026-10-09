# syntax=docker/dockerfile:1

# Stage 1: production dependencies only (three.js - the client bundle needs it).
FROM oven/bun:1.3-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 2: runtime. In production mode Bun bundles client/index.html itself at
# startup, so the sources ship in the image rather than a prebuilt dist/.
FROM oven/bun:1.3-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY shared ./shared
COPY client ./client
COPY server ./server
COPY public ./public

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:' + (process.env.PORT ?? 3000) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "server/index.ts"]
