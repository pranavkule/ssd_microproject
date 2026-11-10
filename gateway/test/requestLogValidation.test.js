const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLogQuery } = require('../src/services/requestLogService');
const { getSafeRequestData, getSafeRequestUrl } = require('../src/utils/requestLogSanitizer');
const mongoose = require('mongoose');
const GatewayRequestLog = require('../src/models/GatewayRequestLog');
const { persistRequestLog } = require('../src/middleware/requestTelemetry');

test('builds supported filters and pagination', () => {
  const { filter, page, limit } = buildLogQuery({
    method: 'get', statusCode: '502', route: 'Users', success: 'false',
    from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z',
    requestId: 'request-1', page: '2', limit: '25',
  });
  assert.equal(filter.method, 'GET');
  assert.equal(filter.statusCode, 502);
  assert.equal(filter.success, false);
  assert.deepEqual(filter.$or, [{ routeName: 'Users' }]);
  assert.equal(filter.timestamp.$gte.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(filter.requestId, 'request-1');
  assert.equal(page, 2);
  assert.equal(limit, 25);
});

test('rejects invalid filters, dates and pagination', () => {
  for (const query of [
    { method: 'TRACE' }, { statusCode: '99' }, { success: 'yes' },
    { from: 'not-a-date' }, { from: '2026-02-01', to: '2026-01-01' },
    { page: '0' }, { limit: '101' }, { unexpected: 'value' },
  ]) assert.throws(() => buildLogQuery(query), { statusCode: 400 });
});

test('redacts sensitive query values in records and console URLs', () => {
  const safe = getSafeRequestData('/api/users?access_token=secret&password=hunter2&search=alice&search=bob');
  assert.equal(safe.path, '/api/users');
  assert.deepEqual(safe.query, [
    { key: 'access_token', value: '[REDACTED]' },
    { key: 'password', value: '[REDACTED]' },
    { key: 'search', value: 'alice' },
    { key: 'search', value: 'bob' },
  ]);
  assert.doesNotMatch(getSafeRequestUrl('/api/users?token=top-secret'), /top-secret/);
  assert.equal(getSafeRequestData('/api/reset/password/private-value').path, '/api/reset/password/[REDACTED]');
});

test('persistence failures are handled without rejecting the request path', async () => {
  const previousReadyState = mongoose.connection.readyState;
  const previousCreate = GatewayRequestLog.create;
  const previousWarn = console.warn;
  let warning = '';
  mongoose.connection.readyState = 1;
  GatewayRequestLog.create = () => Promise.reject(new Error('database write failed'));
  console.warn = (message) => { warning = message; };
  try {
    assert.equal(await persistRequestLog({ requestId: 'failed-write' }), false);
    assert.match(warning, /Request log persistence failed/);
  } finally {
    mongoose.connection.readyState = previousReadyState;
    GatewayRequestLog.create = previousCreate;
    console.warn = previousWarn;
  }
});