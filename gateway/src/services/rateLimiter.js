const DEFAULT_CAPACITY = 100;
const DEFAULT_REFILL_RATE = 20;
const INACTIVE_TTL_MS = 10 * 60 * 1000;

function createRateLimiter(options = {}) {
  const now = options.now || Date.now;
  const buckets = new Map();
  let capacity = options.capacity || DEFAULT_CAPACITY;
  let refillRate = options.refillRate || DEFAULT_REFILL_RATE;
  let enabled = options.enabled ?? true;
  let rejectedRequests = 0;

  function cleanupInactive() {
    const cutoff = now() - INACTIVE_TTL_MS;
    for (const [clientId, bucket] of buckets) {
      if (bucket.lastSeenAt < cutoff) buckets.delete(clientId);
    }
  }

  function consume(clientId) {
    if (!enabled) return { allowed: true, remaining: capacity };

    const currentTime = now();
    let bucket = buckets.get(clientId);
    if (!bucket) {
      bucket = { tokens: capacity, updatedAt: currentTime, lastSeenAt: currentTime };
      buckets.set(clientId, bucket);
    }

    const elapsedSeconds = Math.max(0, currentTime - bucket.updatedAt) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillRate);
    bucket.updatedAt = currentTime;
    bucket.lastSeenAt = currentTime;

    if (bucket.tokens < 1) {
      rejectedRequests += 1;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((1 - bucket.tokens) / refillRate)),
      };
    }

    bucket.tokens -= 1;
    return { allowed: true, remaining: Math.floor(bucket.tokens) };
  }

  function configure(next) {
    const currentTime = now();
    for (const bucket of buckets.values()) {
      const elapsedSeconds = Math.max(0, currentTime - bucket.updatedAt) / 1000;
      bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSeconds * refillRate);
      bucket.updatedAt = currentTime;
    }
    if (typeof next.enabled === 'boolean') enabled = next.enabled;
    if (Number.isInteger(next.capacity)) capacity = next.capacity;
    if (Number.isInteger(next.refillRate)) refillRate = next.refillRate;
    for (const bucket of buckets.values()) {
      bucket.tokens = Math.min(bucket.tokens, capacity);
    }
    return getSnapshot();
  }

  function getSnapshot() {
    return {
      enabled,
      capacity,
      refillRate,
      rejectedRequests,
      activeClients: buckets.size,
    };
  }

  const cleanupTimer = setInterval(cleanupInactive, 60 * 1000);
  cleanupTimer.unref?.();

  return {
    consume,
    configure,
    getSnapshot,
    cleanupInactive,
    reset() {
      buckets.clear();
      rejectedRequests = 0;
    },
    stop() {
      clearInterval(cleanupTimer);
    },
  };
}

const rateLimiter = createRateLimiter();

module.exports = {
  DEFAULT_CAPACITY,
  DEFAULT_REFILL_RATE,
  INACTIVE_TTL_MS,
  createRateLimiter,
  rateLimiter,
};
