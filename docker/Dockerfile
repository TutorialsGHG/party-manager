# ==========================================
# Stage 1: Build & Assets Compilation
# ==========================================
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package manifests
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Install dependencies skipping lifecycle scripts for layer caching
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy application source code
COPY . .

# Compile native addons (better-sqlite3, argon2) on Linux target
RUN pnpm rebuild

# Run production build
RUN pnpm build

# Prune devDependencies to keep production layer slim
RUN pnpm prune --prod

# ==========================================
# Stage 2: Minimal Production Image
# ==========================================
FROM node:22-bookworm-slim AS runner

WORKDIR /app

# Install runtime dependencies: ffmpeg for media processing & openssl for crypto
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    openssl \
    ca-certificates \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Create persistent storage directories
RUN mkdir -p /data/blobs/temp /config/keys/events && \
    chown -R node:node /data /config /app

# Copy production artifacts and dependencies
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --chown=node:node docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Set standard environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    BODY_SIZE_LIMIT=2M \
    DATABASE_PATH=/data/app.db \
    BLOB_STORAGE_PATH=/data/blobs \
    MASTER_KEY_DIR=/config/keys \
    EVENTS_KEY_DIR=/config/keys/events

USER node

EXPOSE 3000

VOLUME ["/data", "/config"]

ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
CMD ["node", "build/index.js"]
