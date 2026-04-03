import type { FastifyRequest, FastifyReply } from "fastify";

export async function checkRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const tenant = request.tenant;
  if (!tenant) return;

  const redis = request.server.redis;
  const now = Date.now();
  const windowMs = 60_000; // 1 minute
  const key = `ratelimit:rpm:${tenant.tenantId}`;

  // Remove old entries + add current + count
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, now - windowMs);
  pipeline.zadd(key, now, `${now}:${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, 120);

  const results = await pipeline.exec();
  if (!results) return;

  const count = results[2][1] as number;

  if (count > tenant.rpmLimit) {
    reply.status(429).send({
      error:     "rate_limit_exceeded",
      message:   `Rate limit: ${tenant.rpmLimit} requests per minute`,
      limit:     tenant.rpmLimit,
      remaining: 0,
      reset_at:  new Date(now + windowMs).toISOString(),
    });
    return;
  }

  // Set rate limit headers
  reply.header("X-RateLimit-Limit", tenant.rpmLimit);
  reply.header("X-RateLimit-Remaining", Math.max(0, tenant.rpmLimit - count));
  reply.header("X-RateLimit-Reset", new Date(now + windowMs).toISOString());
}
