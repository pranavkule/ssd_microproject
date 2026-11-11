const test = require('node:test');
const assert = require('node:assert/strict');
const { createRateLimiter, INACTIVE_TTL_MS } = require('../src/services/rateLimiter');
const { getClientId } = require('../src/middleware/rateLimit');

test('token buckets start full, reject at capacity, and refill over time', () => {
  let currentTime = 0;
  const limiter = createRateLimiter({
    capacity: 2,
    refillRate: 1,
    now: () => currentTime,
  });
  try {
    assert.equal(limiter.consume('client-a').allowed, true);
    assert.equal(limiter.consume('client-a').allowed, true);
    const rejected = limiter.consume('client-a');
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.retryAfterSeconds, 1);
    assert.equal(limiter.getSnapshot().rejectedRequests, 1);

    currentTime += 1000;
    assert.equal(limiter.consume('client-a').allowed, true);
  } finally {
    limiter.stop();
  }
});

test('buckets are per client, can be disabled, and inactive clients are cleaned up', () => {
  let currentTime = 0;
  const limiter = createRateLimiter({
    capacity: 1,
    refillRate: 1,
    now: () => currentTime,
  });
  try {
    assert.equal(limiter.consume('client-a').allowed, true);
    assert.equal(limiter.consume('client-b').allowed, true);
    assert.equal(limiter.getSnapshot().activeClients, 2);

    limiter.configure({ enabled: false });
    assert.equal(limiter.consume('client-a').allowed, true);
    currentTime += INACTIVE_TTL_MS + 1;
    limiter.cleanupInactive();
    assert.equal(limiter.getSnapshot().activeClients, 0);
  } finally {
    limiter.stop();
  }
});

test('client identity ignores arbitrary forwarded IP headers', () => {
  assert.equal(
    getClientId({
      headers: { 'x-forwarded-for': '203.0.113.99' },
      socket: { remoteAddress: '127.0.0.1' },
    }),
    '127.0.0.1'
  );
});
