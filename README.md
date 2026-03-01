# StrategyPlus SureSend

StrategyPlus SureSend is a subscription-based platform for helping small businesses monitor and improve email, SMTP, DNS, and website reputation.

## Stack
- Frontend: Next.js (App Router, TypeScript)
- Backend: NestJS (TypeScript)
- Shared Types: `@suresend/shared`
- Database: PostgreSQL
- Cache/Queue: Redis
- Billing: Stripe (stubbed integration points)
- Containerization: Docker + Docker Compose
- CI/CD: GitHub Actions → GitHub Container Registry (GHCR)
- Kubernetes: Helm chart published to GHCR as an OCI artifact

## Quick Start

### 1) Prerequisites
- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

### 2) Install dependencies
```bash
pnpm install
```

### 3) Run locally (without Docker)
```bash
pnpm dev
```
- Web: http://localhost:3000
- API: http://localhost:4000

### 4) Run with Docker
```bash
docker compose up --build
```

## Workspace Layout
- `apps/web` - Next.js frontend
- `apps/api` - NestJS backend API
- `packages/shared` - shared types and validation schemas
- `helm/suresend` - Helm chart for Kubernetes deployments
- `.github/workflows` - CI/CD pipelines

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

After the first workflow run, make the chart package public so it can be pulled without credentials:

1. Go to **https://github.com/users/frobobbo/packages/container/suresend/settings**
2. Scroll to **Danger Zone → Change visibility → Public**

## Notes
- Current implementation includes secure defaults, module stubs, and starter UI.
- You can wire in Stripe, DNS reputation providers, and SMTP diagnostics iteratively.
- Never commit real secrets — pass them via `--set` or a sealed values file.
