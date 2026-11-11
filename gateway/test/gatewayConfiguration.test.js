const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfiguration } = require('../src/services/gatewayConfiguration');

test('validates supported runtime settings and rejects unknown or out-of-range values', () => {
  assert.deepEqual(validateConfiguration({ proxyTimeoutMs: 10000 }), {
    proxyTimeoutMs: 10000,
  });
  assert.throws(() => validateConfiguration({ proxyTimeoutMs: 1 }), { statusCode: 400 });
  assert.throws(
    () => validateConfiguration({ arbitraryEnvironmentVariable: 'value' }),
    { statusCode: 400 }
  );
  assert.deepEqual(validateConfiguration({
    rateLimitEnabled: false,
    rateLimitCapacity: 50,
    rateLimitRefillRate: 10,
  }), {
    rateLimitEnabled: false,
    rateLimitCapacity: 50,
    rateLimitRefillRate: 10,
  });
  assert.throws(() => validateConfiguration({ rateLimitEnabled: 'false' }), { statusCode: 400 });
  assert.throws(() => validateConfiguration({ rateLimitCapacity: 0 }), { statusCode: 400 });
});