Lee HANDOFF.md primero. Contiene el contexto completo del proyecto OVNI AI.

Stack: Node.js + TypeScript + Fastify + PostgreSQL + Redis + pg-boss
Anthropic SDK: @anthropic-ai/sdk con MessageStream para streaming

Reglas:
- TypeScript estricto, sin any
- Transacciones para toda operación multi-tabla
- API keys solo como SHA-256 hash en DB, nunca texto plano
- Emails siempre fire-and-forget
- Costos de tokens en NUMERIC(12,6), fees en cents (INT)

Próxima tarea prioritaria: dashboard de staff (React + TanStack Query)
Ver sección "Lo que falta" en HANDOFF.md
