# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# iTelemetry v3 — Frontend image (Vite build served by nginx)
# Build from the frontend/ folder:
#   docker build -t itelemetry/frontend:local -f frontend/Dockerfile frontend
# ---------------------------------------------------------------------------

# --- Stage 1: build the static SPA with Vite -------------------------------
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: serve the built assets with nginx ----------------------------
FROM nginx:alpine AS runtime

# SPA routing config (history fallback to index.html).
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
