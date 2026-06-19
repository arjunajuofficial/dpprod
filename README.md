# Station Monitor — Production Deployment

A self-contained, Docker-based deployment package for the Station Monitor NOC
dashboard. This folder contains **only** what is needed to run on a real server.

```
production/
├── backend/            FastAPI backend (Python) + Dockerfile + .dockerignore
├── frontend/           React + Vite app, nginx-served + Dockerfile + .dockerignore
├── agent/              Windows client agent (deployed per monitored server, not containerized)
├── docker-compose.yml  Two-service stack (backend + frontend)
├── .env.example        Copy to .env and fill in
└── README.md           This file
```

## Architecture

- **backend** — FastAPI + asyncio workers (monitoring, notifications, retention).
  Stores data in SQLite on a Docker named volume (`monitor-data` → `/data`).
  Exposes the REST API and WebSocket on port **8000**.
- **frontend** — React app built to static files and served by nginx on port **8080**.
  The backend URL is baked in at build time via `VITE_API_BASE` / `VITE_WS_URL`.
- **agent** — A small Python service installed on each monitored Windows server.
  The backend polls it for CPU/RAM/disk/uptime, events, and service health.
  See [`agent/README.md`](agent/README.md).

## Prerequisites

- A Linux server with **Docker** and the **Docker Compose plugin** installed.
- Ports **8000** (API) and **8080** (UI) open, or a reverse proxy in front.

## Deploy in 4 steps

```bash
# 1. Copy this folder to the server, then enter it
cd production

# 2. Create your environment file
cp .env.example .env

# 3. Edit .env — at minimum set:
#    SECRET_KEY        (python -c "import secrets; print(secrets.token_urlsafe(48))")
#    ADMIN_PASSWORD    (your initial admin password)
#    AGENT_API_KEY     (shared secret for agents)
#    VITE_API_BASE     (the URL clients use to reach the backend, e.g. http://your-host:8000)
#    VITE_WS_URL       (same host, ws:// or wss://, e.g. ws://your-host:8000/ws)
nano .env

# 4. Build and start
docker compose --env-file .env up -d --build
```

Then open **http://your-host:8080** and log in with `ADMIN_USERNAME` /
`ADMIN_PASSWORD`. **Change the admin password immediately** via the user menu →
Settings → Account.

## Verify it's running

```bash
docker compose ps                       # both services should be "running"/"healthy"
curl http://localhost:8000/api/health   # backend health check
docker compose logs -f backend          # tail backend logs
```

## Operations

```bash
docker compose down                 # stop (keeps data volume)
docker compose up -d --build        # rebuild & restart after a code update
docker compose restart backend      # restart one service
```

### Backups

All application data lives in the `monitor-data` volume (the SQLite database).
Back it up with:

```bash
docker run --rm -v station-monitor_monitor-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/monitor-data-backup.tar.gz -C /data .
```

(Volume name is `<project>_monitor-data`; confirm with `docker volume ls`.)

## Configuration reference

| Variable          | Required | Purpose                                                        |
|-------------------|----------|----------------------------------------------------------------|
| `SECRET_KEY`      | yes      | JWT signing key. Must be ≥ 32 chars or the backend won't start.|
| `ADMIN_USERNAME`  | no       | First-run admin login (default `admin`).                       |
| `ADMIN_PASSWORD`  | yes      | First-run admin password.                                      |
| `AGENT_API_KEY`   | strongly | Shared secret matching every agent's `--api-key`.              |
| `VITE_API_BASE`   | yes      | Backend URL baked into the frontend bundle.                    |
| `VITE_WS_URL`     | yes      | Backend WebSocket URL for the frontend.                        |
| `MOCK_MONITORING` | no       | `true` generates demo data; keep `false` in production.        |
| `DATABASE_URL`    | no       | Defaults to SQLite on the volume. See below for Postgres.      |

> **Note:** `VITE_API_BASE` / `VITE_WS_URL` are compiled into the static bundle,
> so changing them requires a frontend rebuild (`docker compose up -d --build frontend`).

## TLS / production hardening

For internet-facing deployments, put a reverse proxy (nginx, Caddy, Traefik) in
front to terminate TLS, and use `https://` / `wss://` URLs in `VITE_API_BASE` /
`VITE_WS_URL`. Keep the backend and agents on a trusted network and always set
`AGENT_API_KEY`.

## Scaling beyond SQLite

SQLite is the correct default for a single backend instance monitoring up to
~100 servers — writes are serialized through one monitor process. If you grow
past that or need multiple backend replicas, switch to PostgreSQL:

1. Uncomment the `db` service in `docker-compose.yml`.
2. Add `asyncpg` to `backend/requirements.txt`.
3. Set `POSTGRES_PASSWORD` and `DATABASE_URL` in `.env` (templates are in both files).
4. Verify `migrations.py` and any SQLite-specific SQL run on Postgres before cutover.
