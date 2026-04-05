# Roadmap: OVNI AI Production Launch

**Milestone:** v1.0 — Production Launch
**Created:** 2026-04-04
**Phases:** 3
**Requirements:** 15 mapped

## Phase 1: AWS Infrastructure + Deploy

**Goal:** Get the platform running on AWS with Postgres, Redis, Docker host, domain, and SSL so the system is accessible from the internet.
**Requirements:** INFRA-01, INFRA-02, INFRA-03, OPS-01
**Depends on:** none
**UI hint:** no

### Success Criteria
1. Backend responds to health check on production domain over HTTPS
2. RDS Postgres and ElastiCache Redis are provisioned and connected
3. Docker host is running and can launch OpenClaw container instances
4. Domain resolves with valid SSL certificate (no browser warnings)
5. Database migration system runs on deploy and applies schema changes

---

## Phase 2: Security Hardening + Payments + Production Config

**Goal:** Lock down the production environment with proper security controls, connect Stripe production keys, and add monitoring so the platform is safe to operate with real client data and payments.
**Requirements:** INFRA-04, SEC-01, SEC-02, SEC-03, SEC-04, PAY-01, OPS-02
**Depends on:** Phase 1
**UI hint:** no

### Success Criteria
1. Server refuses to start if critical environment variables are missing
2. CORS rejects requests from non-production origins
3. Vault encryption key is a real 32-byte random key (not zeros)
4. Stripe webhook receives events on production endpoint and payment flow uses Stripe Elements (no raw card numbers)
5. CloudWatch (or equivalent) alerts fire on server down or instance failure

---

## Phase 3: Channels + End-to-End Testing

**Goal:** Activate all four communication channels and validate the complete provisioning-to-chat flow so the first clients can onboard and start using their AI assistant.
**Requirements:** CHAN-01, CHAN-02, CHAN-03, CHAN-04, PAY-02, OPS-03
**Depends on:** Phase 2
**UI hint:** no

### Success Criteria
1. WhatsApp message sent to Twilio number reaches Claude and returns a reply
2. Telegram message to bot receives a Claude-generated response
3. POST /v1/chat returns a streaming response in production
4. Web Chat widget loads on a test page and completes a conversation
5. Full flow tested: wizard signup, Stripe payment, tenant provisioned, instance launched, message sent and billed

---

*Roadmap created: 2026-04-04*
*Last updated: 2026-04-04*
