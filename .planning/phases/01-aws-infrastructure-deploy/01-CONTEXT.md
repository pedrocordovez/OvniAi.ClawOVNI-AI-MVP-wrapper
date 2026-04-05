# Phase 1: AWS Infrastructure + Deploy - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Get the OVNI AI platform running on AWS with Postgres, Redis, Docker host, domain, and SSL so the system is accessible from the internet. Requirements: INFRA-01, INFRA-02, INFRA-03, OPS-01.

</domain>

<decisions>
## Implementation Decisions

### AWS Architecture
- **D-01:** Single EC2 instance runs everything: the Fastify app (:3000), metering proxy (:3001), Docker daemon for OpenClaw containers, and Nginx reverse proxy
- **D-02:** EC2 instance type: t3.medium or t3.large (needs enough RAM for Docker containers + app + proxy)
- **D-03:** Security group: open 80/443 (HTTP/HTTPS) to the world, 22 (SSH) restricted to Pedro's IP

### Database
- **D-04:** RDS PostgreSQL 16 (db.t3.micro or db.t3.small) — managed, automated daily backups
- **D-05:** Private subnet — RDS only accessible from the EC2 instance, not from internet
- **D-06:** Run all 7 schema SQL files as initial migration on RDS

### Redis
- **D-07:** ElastiCache Redis 7 (cache.t3.micro) — managed, same VPC as EC2
- **D-08:** Private subnet — Redis only accessible from EC2

### Domain + SSL
- **D-09:** Pedro has a domain already — configure DNS in Route53
- **D-10:** SSL via AWS ACM (free certificate) + Nginx terminates SSL on EC2
- **D-11:** Nginx reverse proxy: HTTPS → localhost:3000 (API), serve frontend static files from dist/

### Database Migrations
- **D-12:** Use `node-pg-migrate` for schema migrations — lightweight, SQL-based, fits the existing raw SQL pattern
- **D-13:** Migration script runs on deploy (part of deploy script), before app starts
- **D-14:** Initial migration: import existing 7 schema files as baseline

### Deploy Mechanism
- **D-15:** Manual script: ssh into EC2, git pull, npm install, npm run build, run migrations, restart with PM2 or systemd
- **D-16:** App managed by PM2 or systemd for auto-restart on crash
- **D-17:** No CI/CD for now — deploy when Pedro pushes and runs the script

### Claude's Discretion
- VPC and subnet CIDR ranges
- EC2 AMI choice (Amazon Linux 2023 or Ubuntu)
- PM2 vs systemd for process management
- Nginx config details (buffer sizes, timeouts)
- Whether to use Elastic IP or just the instance public IP with Route53

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Infrastructure
- `docker-compose.yml` — Current local dev setup (Postgres + Redis config, schema mount order)
- `Dockerfile` — Existing container build definition
- `.env.example` or `.env` — All environment variables needed

### Database Schemas (migration baseline)
- `src/db/schema.sql` — Core tables (tenants, users, api_keys, usage_events)
- `src/db/billing_schema.sql` — Billing tables
- `src/db/provisioning_schema.sql` — Provisioning orders
- `src/db/messaging_schema.sql` — Messaging channels/conversations
- `src/db/audit_schema.sql` — Audit logs
- `src/db/webhooks_schema.sql` — Webhook endpoints/deliveries
- `src/db/openclaw_schema.sql` — OpenClaw instances, health log, API key vault

### App Config
- `src/config.ts` — Environment variable definitions and defaults
- `src/server.ts` — Server startup (registers routes, workers, metering proxy)
- `src/services/meteringProxy.ts` — Secondary server on :3001

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Dockerfile` — existing but needs review for production readiness
- `docker-compose.yml` — schema mount order (001-007) defines migration baseline
- `src/config.ts` — all env vars centralized, can derive required vars list
- `package.json` scripts — `build` (tsc), `start` (node dist/server.js) already defined

### Established Patterns
- Backend is a single process that starts both :3000 and :3001 servers
- All 7 SQL schemas are loaded via Docker entrypoint init — need to become proper migrations
- Frontend apps build to `dist/` with Vite — static files to serve via Nginx

### Integration Points
- `DATABASE_URL` — must point to RDS endpoint
- `REDIS_URL` — must point to ElastiCache endpoint
- `METERING_PROXY_URL` — changes from `host.docker.internal:3001` to `localhost:3001` (no Docker-in-Docker)
- `OPENCLAW_VOLUMES_BASE` — needs a path on the EC2 instance with sufficient disk
- `OPENCLAW_NETWORK` — Docker network on EC2 for OpenClaw containers

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches. Pedro wants it simple and fast to deploy this week.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-aws-infrastructure-deploy*
*Context gathered: 2026-04-04*
