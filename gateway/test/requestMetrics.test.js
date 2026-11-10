const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequestMetrics } = require('../src/services/requestMetrics');

test('tracks totals, statuses, duration and route outcomes', () => {
  const metrics = createRequestMetrics();
  metrics.beginRequest();
  metrics.beginRequest();
  metrics.completeRequest({ statusCode: 200, durationMs: 12, routeId: 'r1', routeName: 'Users' });
  metrics.completeRequest({ statusCode: 502, durationMs: 30, routeId: 'r1', routeName: 'Users' });
  const snapshot = metrics.getSnapshot();
  assert.equal(snapshot.totalRequests, 2);
  assert.equal(snapshot.successfulRequests, 1);
  assert.equal(snapshot.failedRequests, 1);
  assert.equal(snapshot.activeRequests, 0);
  assert.equal(snapshot.averageResponseTimeMs, 21);
  assert.deepEqual(snapshot.byStatusCode, { 200: 1, 502: 1 });
  assert.equal(snapshot.byRoute[0].requests, 2);
  assert.equal(snapshot.byRoute[0].averageResponseTimeMs, 21);
});