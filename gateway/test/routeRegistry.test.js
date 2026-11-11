const test = require('node:test');
const assert = require('node:assert/strict');
const Route = require('../src/models/Route');
const registry = require('../src/services/routeRegistry');

let nextId = 1;

function route(overrides = {}) {
  const id = (nextId++).toString(16).padStart(24, '0');
  return {
    id,
    name: `Route ${id}`,
    path: `/route-${id}`,
    target: 'http://localhost:5010',
    methods: ['GET'],
    enabled: true,
    stripPrefix: false,
    ...overrides,
  };
}

async function loadRoutes(routes) {
  const originalFind = Route.find;
  Route.find = () => ({ lean: async () => routes });
  try {
    return await registry.loadFromDatabase();
  } finally {
    Route.find = originalFind;
  }
}

test.beforeEach(async () => {
  await loadRoutes([]);
});

test('registers, disables, enables, and removes routes', () => {
  const active = route({ path: '/runtime' });
  const disabled = route({ path: '/disabled', enabled: false });

  registry.upsertRoute(active);
  registry.upsertRoute(disabled);

  assert.equal(registry.getStats().totalRoutes, 2);
  assert.equal(registry.getStats().enabledRoutes, 1);
  assert.equal(registry.getStats().disabledRoutes, 1);
  assert.equal(registry.matchRoute('/runtime/item', 'GET').route.name, active.name);
  assert.equal(registry.matchRoute('/disabled', 'GET').pathMatched, false);

  registry.upsertRoute({ ...disabled, enabled: true });
  assert.equal(registry.matchRoute('/disabled', 'GET').route.name, disabled.name);

  registry.removeRoute(active.id);
  assert.equal(registry.getStats().totalRoutes, 1);
  assert.equal(registry.matchRoute('/runtime', 'GET').route, null);
});

test('matches the longest prefix and respects path segment boundaries', () => {
  registry.upsertRoute(route({ id: '000000000000000000000001', name: 'Short', path: '/api' }));
  registry.upsertRoute(route({ id: '000000000000000000000002', name: 'Long', path: '/api/v2' }));

  assert.equal(registry.matchRoute('/api/v2/items', 'GET').route.name, 'Long');
  assert.equal(registry.matchRoute('/api/v20', 'GET').route.name, 'Short');
});

test('enforces methods and supports HEAD on configured routes', () => {
  registry.upsertRoute(route({ path: '/read', methods: ['GET', 'HEAD'] }));

  assert.equal(registry.matchRoute('/read', 'HEAD').route.path, '/read');
  const mismatch = registry.matchRoute('/read', 'POST');
  assert.equal(mismatch.methodNotAllowed, true);
  assert.deepEqual(mismatch.allowedMethods, ['GET', 'HEAD']);
});

test('allows HEAD for GET routes even when HEAD is not explicitly configured', () => {
  registry.upsertRoute(route({ path: '/get-only', methods: ['GET'] }));

  const match = registry.matchRoute('/get-only', 'HEAD');
  assert.equal(match.route.path, '/get-only');
  assert.equal(match.methodNotAllowed, false);
  assert.deepEqual(match.allowedMethods, ['GET', 'HEAD']);
});

test('refreshes from MongoDB and preserves the previous snapshot on failure', async () => {
  const persisted = route({ id: '000000000000000000000010', path: '/persisted' });
  const stats = await loadRoutes([persisted]);
  assert.equal(stats.totalRoutes, 1);
  assert.equal(registry.matchRoute('/persisted', 'GET').route.name, persisted.name);

  const originalFind = Route.find;
  Route.find = () => {
    throw new Error('database unavailable');
  };
  try {
    await assert.rejects(registry.loadFromDatabase(), /database unavailable/);
  } finally {
    Route.find = originalFind;
  }

  assert.equal(registry.matchRoute('/persisted', 'GET').route.name, persisted.name);
  assert.equal(registry.getStats().stale, true);
});
