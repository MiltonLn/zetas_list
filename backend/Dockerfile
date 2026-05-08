# ============ Stage 1: Build frontend ============
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY ../frontend/package*.json ./
RUN npm install --legacy-peer-deps

COPY ../frontend .

ARG VITE_API_URL=/api
ARG VITE_SENTRY_DSN
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN

RUN npm run build

# ============ Stage 2: Build backend ============
FROM node:20-alpine AS backend-builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

# ============ Stage 3: Production ============
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/prisma ./prisma
COPY --from=frontend-builder /app/frontend/dist ./public
COPY package*.json ./

RUN npx prisma generate

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
