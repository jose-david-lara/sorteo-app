# syntax=docker/dockerfile:1

# --- Build: tests + bundle estático ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

# --- Runtime: nginx sin root, solo archivos estáticos ---
FROM nginxinc/nginx-unprivileged:1.29-alpine
LABEL org.opencontainers.image.title="sorteo-arbitros-camp" \
      org.opencontainers.image.description="Sorteo de árbitros - Centro de Arbitraje y Mediación Paraguay"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
