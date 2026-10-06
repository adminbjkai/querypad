# QueryPad production image: Next.js standalone server + the Yjs collaboration relay.
# DuckDB runs in the browser (wasm), so the server stays small.

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY scripts ./scripts
# Skip the native CLI addon (@duckdb/node-api) download; the web image never loads it.
RUN npm ci --ignore-scripts && node scripts/copy-duckdb-wasm.mjs && node scripts/copy-editor-assets.mjs
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
# Relay: plain ESM; needs ws, yjs, y-protocols, lib0 (+ its one dependency, isomorphic.js).
COPY --from=builder --chown=node:node /app/collab ./collab
COPY --from=builder --chown=node:node /app/node_modules/ws ./node_modules/ws
COPY --from=builder --chown=node:node /app/node_modules/yjs ./node_modules/yjs
COPY --from=builder --chown=node:node /app/node_modules/y-protocols ./node_modules/y-protocols
COPY --from=builder --chown=node:node /app/node_modules/lib0 ./node_modules/lib0
COPY --from=builder --chown=node:node /app/node_modules/isomorphic.js ./node_modules/isomorphic.js
# Saved spaces (mounted as a volume by docker-compose).
RUN mkdir -p /data && chown node:node /data
ENV QUERYPAD_DATA_DIR=/data
USER node
EXPOSE 3000 1999
CMD ["node", "server.js"]
