# StrategyPlus SureSend

StrategyPlus SureSend is a subscription-based platform for helping small businesses monitor and improve email, SMTP, DNS, and website reputation.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router, TypeScript) + Tailwind CSS v4 + shadcn/ui |
| Backend | NestJS (TypeScript) |
| Auth | JWT (passport-jwt), bcrypt password hashing |
| Shared Types | `@suresend/shared` (Zod schemas) |
| Database | PostgreSQL via TypeORM |
| Cache/Queue | Redis |
| Billing | Stripe (stubbed) |
| Containers | Docker + Docker Compose |
| CI/CD | GitHub Actions → GitHub Container Registry (GHCR) |
| Kubernetes | Helm chart published to GHCR as an OCI artifact |

---

## Quick Start

### 1) Prerequisites
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### 2) Start the database

```bash
docker compose up db -d
```

### 3) Configure environment

```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env — set DATABASE_URL and JWT_SECRET at minimum
```

### 4) Install dependencies

```bash
pnpm install
```

### 5) Run locally

```bash
pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:4000

### 6) Run everything with Docker

```bash
docker compose up --build
```

---

## Workspace Layout

```
apps/
  web/          Next.js frontend (App Router)
  api/          NestJS backend API
packages/
  shared/       Shared Zod schemas and TypeScript types
helm/
  suresend/     Helm chart for Kubernetes deployments
.github/
  workflows/    CI/CD pipelines
```

---

## Features

### Authentication
- **Self-registration** — `POST /api/auth/register`
- **Login** — `POST /api/auth/login` returns a 7-day JWT
- **Current user** — `GET /api/auth/me`
- Passwords are hashed with bcrypt (12 rounds)

### User Management
Two roles: `admin` and `user`.

| Endpoint | Access | Description |
|---|---|---|
| `GET /api/users` | Admin | List all users |
| `POST /api/users` | Admin | Create a user with a specified role |
| `PATCH /api/users/:id/role` | Admin | Change a user's role |
| `DELETE /api/users/:id` | Admin | Delete a user |

### Domain Management
Domains can be owned by a user and optionally delegated to other users.

| Endpoint | Access | Description |
|---|---|---|
| `GET /api/domains` | Auth | List domains (admin: all; user: owned + delegated) |
| `POST /api/domains` | Auth | Register a new domain |
| `GET /api/domains/:id` | Auth + access | Get domain details |
| `DELETE /api/domains/:id` | Owner or Admin | Delete a domain |
| `POST /api/domains/:id/access` | Owner or Admin | Delegate access to a user |
| `DELETE /api/domains/:id/access/:userId` | Owner or Admin | Revoke delegated access |

### Domain Reputation Tracking
Each reputation check runs the following probes in parallel and returns a score (0–100) and status (`clean` / `warning` / `blacklisted`).

| Check | Method | Score impact |
|---|---|---|
| **MX Records** | DNS `resolveMx` | −30 if missing |
| **SPF Record** | DNS TXT `v=spf1` lookup | −15 if missing |
| **DMARC Record** | DNS TXT `_dmarc.<domain>` | −15 if missing |
| **DKIM Record** | DNS TXT, 7 common selectors | −10 if none found |
| **HTTPS Reachability** | HTTPS GET with 5 s timeout | −10 if unreachable |
| **RBL Blacklists** | DNS reverse-IP lookup against Spamhaus, SpamCop, SORBS, Barracuda | −20 per listing |

| Endpoint | Access | Description |
|---|---|---|
| `POST /api/domains/:id/reputation/check` | Auth + access | Run a new reputation check |
| `GET /api/domains/:id/reputation` | Auth + access | List last 10 checks |

**Score thresholds:**
- `clean` — 80–100
- `warning` — 50–79
- `blacklisted` — 0–49

### Frontend Pages

| Route | Description |
|---|---|
| `/login` | Login and self-registration |
| `/dashboard` | Domain summary cards |
| `/domains` | Domain list with add, delete, and access delegation |
| `/domains/[id]` | Reputation score gauge, per-check breakdown, history table |
| `/users` | Admin-only user management |

---

## Environment Variables

### `apps/api/.env`

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/suresend
JWT_SECRET=replace-with-a-long-random-string
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_test_...
CORS_ORIGIN=http://localhost:3000
PORT=4000
```

### `apps/web/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

---

## CI/CD

Two GitHub Actions workflows run on every push to `main`:

| Workflow | Trigger | What it does |
|---|---|---|
| `docker-build.yml` | Push to `main` or `v*` tag | Builds and pushes `api` and `web` images to GHCR |
| `helm-release.yml` | Push to `main` with changes in `helm/**` | Packages the Helm chart and pushes it to GHCR as an OCI artifact |

### Container Images

Images are published to GitHub Container Registry:

```
ghcr.io/frobobbo/sps-suresend/api:<tag>
ghcr.io/frobobbo/sps-suresend/web:<tag>
```

Tags produced per build: `latest`, `main`, `sha-<short-sha>`, and semver tags on `v*` releases.

To create a versioned release:

```bash
git tag v0.2.0
git push origin v0.2.0
```

---

## Helm

The chart is distributed as an OCI artifact via GitHub Container Registry. No `helm repo add` needed.

### Install

```bash
helm install my-suresend oci://ghcr.io/frobobbo/suresend \
  --version 0.1.3 \
  --set api.secrets.jwtSecret=<secret> \
  --set api.secrets.databaseUrl=postgresql://user:pass@host:5432/suresend \
  --set api.secrets.redisUrl=redis://redis:6379 \
  --set api.secrets.stripeSecretKey=sk_live_... \
  --set ingress.web.host=suresend.example.com \
  --set ingress.api.host=api.suresend.example.com
```

### Upgrade

```bash
helm upgrade my-suresend oci://ghcr.io/frobobbo/suresend \
  --version <new-version> \
  --reuse-values \
  --set api.image.tag=<new-tag> \
  --set web.image.tag=<new-tag>
```

### Key values

| Value | Default | Description |
|---|---|---|
| `api.image.repository` | `ghcr.io/frobobbo/sps-suresend/api` | API image |
| `web.image.repository` | `ghcr.io/frobobbo/sps-suresend/web` | Web image |
| `api.image.tag` | Chart appVersion | Image tag to deploy |
| `api.replicaCount` | `1` | API replica count |
| `web.replicaCount` | `1` | Web replica count |
| `ingress.enabled` | `true` | Enable ingress |
| `ingress.className` | `nginx` | Ingress class |
| `ingress.web.host` | `suresend.example.com` | Web hostname |
| `ingress.api.host` | `api.suresend.example.com` | API hostname |
| `api.secrets.jwtSecret` | `replace-me` | JWT signing secret |
| `api.secrets.databaseUrl` | — | PostgreSQL connection string |
| `api.secrets.redisUrl` | `redis://redis:6379` | Redis connection string |
| `api.secrets.stripeSecretKey` | — | Stripe secret key |

### One-time GHCR setup

After the first workflow run, make the packages public so they can be pulled without credentials:

1. Helm chart: **https://github.com/users/frobobbo/packages/container/suresend/settings** → Change visibility → Public
2. API image: **https://github.com/users/frobobbo/packages/container/sps-suresend%2Fapi/settings** → Change visibility → Public
3. Web image: **https://github.com/users/frobobbo/packages/container/sps-suresend%2Fweb/settings** → Change visibility → Public

---

## Notes
- `synchronize: true` is enabled in TypeORM for development — replace with migrations before going to production.
- Never commit real secrets — pass them via `--set` or a sealed values file.
- Stripe and SMTP diagnostic integrations are stubbed and can be wired in iteratively.
