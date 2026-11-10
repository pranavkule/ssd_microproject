const test = require('node:test');
const assert = require('node:assert/strict');
const loadBalancer = require('../src/services/loadBalancer');

function route(overrides = {}) {
  return {
    _id: 'route-1',
    enabled: true,
    loadBalancingStrategy: 'round_robin',
    backendInstances: [
      { id: 'one', target: 'http://localhost:5001', enabled: true },
      { id: 'two', target: 'http://localhost:5002', enabled: true },
    ],
    ...overrides,
  };
}

function monitor(healthyIds) {
  return {
    getBackendHealth: (_route, backend) => ({
      healthy: healthyIds.includes(backend.id),
    }),
  };
}

test.beforeEach(() => loadBalancer.reset());

test('round robin uses healthy backends in deterministic order', () => {
  const config = route();
  const health = monitor(['one', 'two']);
  const first = loadBalancer.selectBackend(config, health);
  const second = loadBalancer.selectBackend(config, health);
  const third = loadBalancer.selectBackend(config, health);

  assert.deepEqual([first.backend.id, second.backend.id, third.backend.id], [
    'one',
    'two',
    'one',
  ]);
  first.release();
  second.release();
  third.release();
});

test('round robin skips disabled and unhealthy backends and resets after config changes', () => {
  const config = route({
    backendInstances: [
      { id: 'one', target: 'http://localhost:5001', enabled: false },
      { id: 'two', target: 'http://localhost:5002', enabled: true },
      { id: 'three', target: 'http://localhost:5003', enabled: true },
    ],
  });
  const selected = loadBalancer.selectBackend(config, monitor(['one', 'two']));
  assert.equal(selected.backend.id, 'two');
  selected.release();

  const expanded = {
    ...config,
    backendInstances: [
      ...config.backendInstances,
      { id: 'four', target: 'http://localhost:5004', enabled: true },
    ],
  };
  const afterChange = loadBalancer.selectBackend(expanded, monitor(['two', 'four']));
  assert.equal(afterChange.backend.id, 'four');
  afterChange.release();
});

test('least connections increments, tie-breaks by id, and releases exactly once', () => {
  const config = route({ loadBalancingStrategy: 'least_connections' });
  const health = monitor(['one', 'two']);
  const first = loadBalancer.selectBackend(config, health);
  const second = loadBalancer.selectBackend(config, health);
  const third = loadBalancer.selectBackend(config, health);

  assert.deepEqual(
    [first.backend.id, second.backend.id, third.backend.id],
    ['one', 'two', 'one']
  );
  assert.equal(loadBalancer.getActiveConnections(config._id, 'one'), 2);
  first.release();
  first.release();
  assert.equal(loadBalancer.getActiveConnections(config._id, 'one'), 1);
  first.release();
  second.release();
  third.release();
  assert.equal(loadBalancer.getActiveConnections(config._id, 'one'), 0);
});

test('random selects only healthy, enabled instances', () => {
  const config = route({
    loadBalancingStrategy: 'random',
    backendInstances: [
      { id: 'disabled', target: 'http://localhost:5000', enabled: false },
      ...route().backendInstances,
    ],
  });
  for (let index = 0; index < 25; index += 1) {
    const selection = loadBalancer.selectBackend(config, monitor(['disabled', 'two']));
    assert.equal(selection.backend.id, 'two');
    selection.release();
  }
});

test('all unhealthy backends produce no selection', () => {
  assert.equal(
    loadBalancer.selectBackend(route(), monitor([])),
    null
  );
});
