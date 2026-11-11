const test = require('node:test');
const assert = require('node:assert/strict');
const Route = require('../src/models/Route');
const {
  assertValidObjectId,
  normalizeMethods,
  normalizePath,
  normalizeTarget,
  validateCreatePayload,
  validateUpdatePayload,
} = require('../src/utils/routeValidation');
const { buildDefaultRoutes } = require('../src/config/defaultRoutes');

const validPayload = {
  name: 'Catalog',
  path: '/catalog',
  target: 'http://localhost:5010',
  methods: ['GET'],
};

test('normalizes valid route paths, targets, and methods', () => {
  assert.equal(normalizePath(' /catalog//items/ '), '/catalog/items');
  assert.equal(normalizeTarget(' http://localhost:5010/base '), 'http://localhost:5010/base');
  assert.deepEqual(normalizeMethods(['get', 'GET', 'head', 'options']), [
    'GET',
    'HEAD',
    'OPTIONS',
  ]);
  assert.deepEqual(validateCreatePayload(validPayload).methods, ['GET']);
});

test('rejects invalid and reserved paths and invalid targets', () => {
  for (const path of ['catalog', '/catalog?x=1', '/catalog#part', '/health/live', '/api/gateway/routes']) {
    assert.throws(() => normalizePath(path), { statusCode: 400 });
  }

  for (const target of ['localhost:5010', 'ftp://localhost/file', 'http://localhost/?q=1']) {
    assert.throws(() => normalizeTarget(target), { statusCode: 400 });
  }
});

test('rejects unsupported methods and invalid MongoDB IDs', () => {
  assert.throws(() => normalizeMethods(['TRACE']), { statusCode: 400 });
  assert.throws(() => assertValidObjectId('not-an-object-id'), { statusCode: 400 });
  assert.doesNotThrow(() => assertValidObjectId('0123456789abcdef01234567'));
});

test('rejects empty or invalid update payloads', () => {
  assert.throws(() => validateUpdatePayload({}), { statusCode: 400 });
  assert.throws(() => validateUpdatePayload({ enabled: 'yes' }), { statusCode: 400 });
  assert.throws(() => validateUpdatePayload(null), { statusCode: 400 });
  assert.deepEqual(validateUpdatePayload({ enabled: false }), { enabled: false });
});

test('validates backend instances and load-balancing strategies', () => {
  const created = validateCreatePayload({
    ...validPayload,
    backends: [
      { id: 'one', target: 'http://localhost:5001', enabled: true, weight: 2 },
      { id: 'two', target: 'http://localhost:5002', enabled: false },
    ],
    strategy: 'least_connections',
  });
  assert.equal(created.target, 'http://localhost:5001');
  assert.equal(created.backendInstances.length, 2);
  assert.equal(created.loadBalancingStrategy, 'least_connections');

  assert.throws(
    () =>
      validateCreatePayload({
        ...validPayload,
        backends: [
          { id: 'duplicate', target: 'http://localhost:5001' },
          { id: 'duplicate', target: 'http://localhost:5002' },
        ],
      }),
    { statusCode: 400 }
  );
  assert.throws(
    () =>
      validateCreatePayload({
        ...validPayload,
        loadBalancingStrategy: 'weighted',
      }),
    { statusCode: 400 }
  );
  assert.throws(
    () =>
      validateCreatePayload({
        ...validPayload,
        backends: [{ id: 'bad', target: 'http://localhost:5001', weight: 0 }],
      }),
    { statusCode: 400 }
  );
});

test('route model enforces unique route names and paths', () => {
  assert.equal(Route.schema.path('name').options.unique, true);
  assert.equal(Route.schema.path('path').options.unique, true);
  assert.equal(Route.schema.path('authRequired').defaultValue, false);
});

test('validates route authentication settings and required roles', () => {
  const created = validateCreatePayload({
    ...validPayload,
    authRequired: true,
    requiredRoles: ['operator', 'reader'],
  });
  assert.equal(created.authRequired, true);
  assert.deepEqual(created.requiredRoles, ['operator', 'reader']);
  assert.deepEqual(
    validateUpdatePayload({ authRequired: false, requiredRoles: ['reader'] }),
    { authRequired: false, requiredRoles: ['reader'] }
  );
  assert.equal(validateCreatePayload(validPayload).authRequired, false);
  assert.deepEqual(validateCreatePayload(validPayload).requiredRoles, []);
  assert.throws(
    () => validateUpdatePayload({ authRequired: 'true' }),
    { statusCode: 400 }
  );
  assert.throws(
    () => validateUpdatePayload({ requiredRoles: ['bad role'] }),
    { statusCode: 400 }
  );
  assert.throws(
    () => validateUpdatePayload({ requiredRoles: Array(21).fill('reader') }),
    { statusCode: 400 }
  );
});

test('all default routes advertise HEAD when they support GET', () => {
  for (const route of buildDefaultRoutes()) {
    assert.ok(route.methods.includes('GET'));
    assert.ok(route.methods.includes('HEAD'));
  }
});
