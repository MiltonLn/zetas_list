# ============ Stage 1: Build frontend ============
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

COPY frontend/ .

ARG VITE_API_URL=/api
ARG VITE_SENTRY_DSN
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

RUN npm run build

# ============ Stage 2: Build backend ============
# Use slim (Debian/glibc) so native modules like @sentry/profiling-node
# compile and run correctly. Alpine (musl) causes silent segfaults with
# glibc-compiled native bindings.
FROM node:20-slim AS backend-builder
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY backend/package*.json ./
RUN npm install

COPY backend/ .

RUN npx prisma generate
RUN npm run build

# ============ Stage 3: Production ============
FROM node:20-slim AS production
WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=backend-builder /app/node_modules ./node_modules
# Ensure @sentry/profiling-node is never present — its native glibc addon
# auto-loads via @sentry/node and segfaults silently on any Linux variant
# before any JavaScript can run.
RUN rm -rf node_modules/@sentry/profiling-node
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/prisma ./prisma
COPY --from=frontend-builder /app/frontend/dist ./public
COPY backend/package*.json ./

RUN mkdir -p uploads && npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
