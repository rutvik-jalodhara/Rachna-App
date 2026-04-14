function getClientIp(req) {
  // If behind a proxy, set `app.set('trust proxy', 1)` in server.js to rely on X-Forwarded-For.
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || "unknown";
}

/**
 * Simple in-memory fixed-window rate limiter.
 * Good for single-instance deployments. For multi-instance, move to Redis.
 */
function createRateLimiter({ windowMs = 60_000, max = 60, keyFn = getClientIp } = {}) {
  const buckets = new Map(); // key -> { count, resetAt }

  function cleanup(now) {
    // best-effort cleanup; bounded by traffic
    for (const [key, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    if (buckets.size > 2000) cleanup(now);

    const key = keyFn(req);
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - 1)));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil((now + windowMs) / 1000)));
      return next();
    }

    existing.count += 1;
    const remaining = Math.max(0, max - existing.count);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(existing.resetAt / 1000)));

    if (existing.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      return res.status(429).json({ error: "Too many requests. Please try again shortly." });
    }

    return next();
  };
}

module.exports = { createRateLimiter };

