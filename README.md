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

## Notes
- Current implementation includes secure defaults, module stubs, and starter UI.
- You can wire in Stripe, DNS reputation providers, and SMTP diagnostics iteratively.
