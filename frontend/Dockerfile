# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Point the bundle at the backend (override at build time for your deployment)
ARG VITE_API_BASE=http://localhost:8000
ARG VITE_WS_URL=ws://localhost:8000/ws
ENV VITE_API_BASE=$VITE_API_BASE VITE_WS_URL=$VITE_WS_URL
RUN npm run build

# ── Serve stage ──────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
