# Phase 1: AWS Infrastructure + Deploy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions captured in CONTEXT.md — this log preserves the conversation.

**Date:** 2026-04-04
**Phase:** 01-aws-infrastructure-deploy
**Mode:** discuss
**Areas discussed:** AWS Architecture, Database Setup, Domain + SSL, Deploy Mechanism

## Decisions Made

### AWS Architecture
- **Q:** App server + OpenClaw Docker host approach
- **A:** Single EC2 instance — runs app, metering proxy, Docker, Nginx. Simplest and fastest.

### Database
- **Q:** Managed vs self-hosted Postgres
- **A:** RDS PostgreSQL — managed, automated backups

### Redis
- **Q:** Managed vs self-hosted Redis
- **A:** ElastiCache Redis — managed, same VPC

### Domain + SSL
- **Q:** Domain availability
- **A:** Pedro already has a domain
- **Q:** DNS/SSL approach
- **A:** Route53 + ACM (free SSL certificate)

### Deploy Mechanism
- **Q:** How to deploy
- **A:** Manual script (ssh + git pull + build + migrate + restart). No CI/CD for now.

### Migration System (Claude's Discretion)
- node-pg-migrate selected as migration tool — fits existing raw SQL pattern
