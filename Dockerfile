# ── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ── Stage 2: Backend + serve frontend ────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Install backend deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY src/ ./src/

# Copy built frontend
COPY --from=frontend /app/web/dist ./web/dist

EXPOSE 3000
CMD ["node", "src/server.js"]
