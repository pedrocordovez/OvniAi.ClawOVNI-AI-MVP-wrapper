# Requirements: OVNI AI Production Launch

**Defined:** 2026-04-04
**Core Value:** Clients can self-provision and immediately use an AI assistant across their communication channels

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: Platform deploys to AWS with Postgres (RDS), Redis (ElastiCache), and app server (ECS/EC2)
- [ ] **INFRA-02**: Docker host available for OpenClaw container instances
- [ ] **INFRA-03**: Domain with SSL configured (reverse proxy with HTTPS)
- [ ] **INFRA-04**: Environment variables validated at startup (fail fast if missing critical vars)

### Security

- [ ] **SEC-01**: CORS restricted to production domain(s) only
- [ ] **SEC-02**: Vault encryption key set to real 32-byte random key in production
- [ ] **SEC-03**: Card payment flow uses Stripe Elements (no raw card numbers through API)
- [ ] **SEC-04**: Graceful shutdown handler for connections/workers

### Payments

- [ ] **PAY-01**: Stripe production keys connected and webhook endpoint registered
- [ ] **PAY-02**: Provisioning flow tested end-to-end with Stripe test mode

### Channels

- [ ] **CHAN-01**: WhatsApp via Twilio functional with real phone number
- [ ] **CHAN-02**: Telegram bot functional with real bot token
- [ ] **CHAN-03**: API direct (POST /v1/chat) working in production
- [ ] **CHAN-04**: Web Chat widget embeddable on client websites

### Operations

- [ ] **OPS-01**: Database migration system for schema changes post-launch
- [ ] **OPS-02**: Basic monitoring/alerting (server health, instance status)
- [ ] **OPS-03**: Full provisioning flow tested (wizard → payment → tenant → instance → chat)

## v2 Requirements

### Integrations

- **INT-01**: Slack workspace integration
- **INT-02**: Microsoft Teams bot integration
- **INT-03**: Custom OpenClaw skills per tenant

### Quality

- **QUAL-01**: Comprehensive test suite (unit + integration)
- **QUAL-02**: CI/CD pipeline (GitHub Actions)
- **QUAL-03**: Automated database backups

### Scale

- **SCALE-01**: Multi-host OpenClaw instance distribution
- **SCALE-02**: Horizontal scaling for API server
- **SCALE-03**: CDN for frontend assets

## Out of Scope

| Feature | Reason |
|---------|--------|
| Slack/Teams | Not needed for initial clients, defer to v2 |
| Test suite | Time pressure — launch first, stabilize after |
| Mobile app | Web-first, clients access via browser |
| OAuth/SSO | API key auth sufficient for v1 |
| Multi-region | Single AWS region for launch |
| Custom skills | Standard OpenClaw config for now |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 2 | Pending |
| SEC-01 | Phase 2 | Pending |
| SEC-02 | Phase 2 | Pending |
| SEC-03 | Phase 2 | Pending |
| SEC-04 | Phase 2 | Pending |
| PAY-01 | Phase 2 | Pending |
| PAY-02 | Phase 3 | Pending |
| CHAN-01 | Phase 3 | Pending |
| CHAN-02 | Phase 3 | Pending |
| CHAN-03 | Phase 3 | Pending |
| CHAN-04 | Phase 3 | Pending |
| OPS-01 | Phase 2 | Pending |
| OPS-02 | Phase 2 | Pending |
| OPS-03 | Phase 3 | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-04-04*
*Last updated: 2026-04-04 after initial definition*
