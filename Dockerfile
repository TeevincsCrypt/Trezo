# TREZO production image (used by Railway automatically when present).
# No native modules: SQLite is Node's built-in node:sqlite, so a slim image is enough.
FROM node:22-slim AS build
WORKDIR /app
# NEXT_PUBLIC_* values are compiled into the client bundle, so they must exist
# at build time. Railway passes service variables to declared ARGs.
ARG NEXT_PUBLIC_NEAR_NETWORK=testnet
ARG NEXT_PUBLIC_TREZO_CONTRACT_ID=
ARG NEXT_PUBLIC_NEAR_RPC_URL=
ARG NEXT_PUBLIC_MAP_STYLE_URLS=
ARG NEXT_PUBLIC_DEMO_LAT=
ARG NEXT_PUBLIC_DEMO_LNG=
ARG NEXT_PUBLIC_DEMO_NAME=
ENV NEXT_PUBLIC_NEAR_NETWORK=$NEXT_PUBLIC_NEAR_NETWORK \
    NEXT_PUBLIC_TREZO_CONTRACT_ID=$NEXT_PUBLIC_TREZO_CONTRACT_ID \
    NEXT_PUBLIC_NEAR_RPC_URL=$NEXT_PUBLIC_NEAR_RPC_URL \
    NEXT_PUBLIC_MAP_STYLE_URLS=$NEXT_PUBLIC_MAP_STYLE_URLS \
    NEXT_PUBLIC_DEMO_LAT=$NEXT_PUBLIC_DEMO_LAT \
    NEXT_PUBLIC_DEMO_LNG=$NEXT_PUBLIC_DEMO_LNG \
    NEXT_PUBLIC_DEMO_NAME=$NEXT_PUBLIC_DEMO_NAME \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY scripts/copy-maplibre-worker.mjs scripts/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 TREZO_DB_PATH=/data/trezo.db
COPY --from=build /app/package.json /app/next.config.ts ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
RUN mkdir -p /data
EXPOSE 8080
CMD ["sh", "-c", "exec npx next start -p ${PORT:-8080}"]
