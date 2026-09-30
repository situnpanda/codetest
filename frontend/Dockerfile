# syntax=docker/dockerfile:1
# ---------------------------------------------------------------------------
# iTelemetry — Frontend image (Vite build served by nginx)
# Build from the frontend/ folder:
#   docker build -t itelemetry/frontend:local -f frontend/Dockerfile frontend
#
# Notes:
# - Vite 7 + @vitejs/plugin-react 5 require Node >= 20; we build on node:22 (LTS).
# - Vite outputs to /app/dist (not CRA's build/).
# - nginx-unprivileged listens on 8080, writes temp/pid under /tmp, and runs as a
#   non-root user, so it works under the chart's restricted securityContext
#   (runAsNonRoot, runAsUser 1000, all capabilities dropped).
# ---------------------------------------------------------------------------

# --- Stage 1: build the static SPA with Vite -------------------------------
FROM artifactory.wu2.cloud.providence.org/docker-remote/node:22-alpine AS build

WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN chown -R node:node /app

USER node
RUN npm ci

COPY --chown=node:node . .
RUN npm run build

# --- Stage 2: serve the built assets with nginx (rootless) -----------------
FROM artifactory.wu2.cloud.providence.org/docker-remote/nginxinc/nginx-unprivileged:alpine AS runtime

# SPA routing config (history fallback to index.html), listens on 8080.
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
