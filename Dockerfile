# Use a specific Node version for consistency
ARG NODE_VERSION=22.14.0

# --- Stage 1: Build ---
# We use --platform=$BUILDPLATFORM to run the build tasks natively (fast)
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-alpine AS builder
WORKDIR /app

# Install build dependencies (needed for native modules like better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Use a cache mount for npm to speed up repeated builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy the rest of your source code
COPY . .

# Run the TypeScript build
RUN npm run build

# Remove development dependencies to keep the final image slim
RUN npm prune --production


# --- Stage 2: Run ---
FROM node:${NODE_VERSION}-alpine AS runner
WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Copy the production dependencies and compiled code from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Create the cache directory for Actual Budget data and set permissions
# This ensures the app can write its budget cache even in restricted environments
RUN mkdir -p .actual-cache && chmod 777 .actual-cache

# Healthcheck to ensure the server is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/healthcheck || exit 1

# Expose the application port
EXPOSE ${PORT}

# Run the server
CMD ["node", "dist/bin/server.js"]
