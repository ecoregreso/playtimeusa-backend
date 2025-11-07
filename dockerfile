# syntax=docker/dockerfile:1.7-labs

################################################################################
# Production image for the PlaytimeUSA backend
################################################################################
FROM node:20-bookworm-slim AS base
LABEL org.opencontainers.image.source="https://github.com/playtimeusa/playtimeusa-backend"
LABEL org.opencontainers.image.description="PlaytimeUSA voucher casino backend API"
LABEL org.opencontainers.image.licenses="MIT"

# Ensure we have the latest security patches and create a non-root user
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --system --create-home --uid 1001 api

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies using the lockfile for deterministic builds
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application sources
COPY . .

# Drop privileges
RUN chown -R api:api /app
USER api

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node ./utils/healthcheck.js || exit 1

CMD ["tini", "--", "node", "server.js"]
