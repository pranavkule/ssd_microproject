const http = require('node:http');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const app = require('../src/app');
const env = require('../src/config/env');
const Route = require('../src/models/Route');
const registry = require('../src/services/routeRegistry');
const routeService = require('../src/services/routeService');
const backendHealthMonitor = require('../src/services/backendHealthMonitor');
const { connectDatabase } = require('../src/config/db');

const mongoUri = process.env.GATEWAY_TEST_MONGODB_URI;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close(resolve);
  });
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  return { response, data };
}

test(
  'MongoDB-backed route lifecycle, recovery, and persistence',
  { skip: mongoUri ? false : 'Set GATEWAY_TEST_MONGODB_URI to run isolated MongoDB integration tests' },
  async () => {
    const originalMongoUri = env.mongoUri;
    const testDatabase = `gateway_phase5_test_${process.pid}_${Date.now()}`;
    const parsedMongoUri = new URL(mongoUri);
    parsedMongoUri.pathname = `/${testDatabase}`;
    env.mongoUri = parsedMongoUri.toString();

    let gateway;
    let upstreamOne;
    let upstreamTwo;

    try {
      assert.equal(await connectDatabase(), true);
      await mongoose.connection.dropDatabase();

      const createUpstream = (name) =>
        http.createServer((req, res) => {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ upstream: name, method: req.method, url: req.url }));
        });

      upstreamOne = createUpstream('one');
      upstreamTwo = createUpstream('two');
      const portOne = await listen(upstreamOne);
      const portTwo = await listen(upstreamTwo);

      const startup = await routeService.initializeRouteSystem();
      assert.equal(startup.defaultsCreated, 4);
      assert.equal(startup.totalRoutes, 4);

      const savedUserDefault = await Route.findOne({ name: 'User Service' });
      await Route.updateOne(
        { _id: savedUserDefault._id },
        {
          $pull: { methods: 'HEAD' },
          $unset: { backendInstances: 1, loadBalancingStrategy: 1 },
          $set: { target: `http://127.0.0.1:${portTwo}` },
        }
      );

      const repeatedStartup = await routeService.initializeRouteSystem();
      assert.equal(repeatedStartup.defaultsCreated, 0);
      assert.equal(repeatedStartup.defaultsSkipped, 4);
      const refreshedUserDefault = await Route.findOne({ name: 'User Service' });
      assert.ok(refreshedUserDefault.methods.includes('HEAD'));
      assert.equal(refreshedUserDefault.target, `http://127.0.0.1:${portTwo}`);
      assert.equal(refreshedUserDefault.backendInstances.length, 2);
      assert.equal(refreshedUserDefault.backendInstances[0].target, `http://127.0.0.1:${portTwo}`);

      gateway = app.listen(0, '127.0.0.1');
      await new Promise((resolve) => gateway.once('listening', resolve));
      const baseUrl = `http://127.0.0.1:${gateway.address().port}`;

      let result = await request(baseUrl, '/api/gateway/routes');
      assert.equal(result.response.status, 200);
      assert.equal(result.data.count, 4);

      const created = await request(baseUrl, '/api/gateway/routes', {
        method: 'POST',
        body: {
          name: 'Integration Runtime Route',
          path: '/integration-runtime',
          backends: [
            { id: 'one', target: `http://127.0.0.1:${portOne}`, enabled: true },
            { id: 'two', target: `http://127.0.0.1:${portTwo}`, enabled: true },
          ],
          loadBalancingStrategy: 'round_robin',
          methods: ['GET', 'HEAD', 'OPTIONS'],
        },
      });
      assert.equal(created.response.status, 201);
      const routeId = created.data.data.id;
      await backendHealthMonitor.checkAll();
      assert.equal(created.data.data.backendInstances.length, 2);
      assert.equal(created.data.data.loadBalancingStrategy, 'round_robin');

      result = await request(baseUrl, `/api/gateway/routes/${routeId}`);
      assert.equal(result.response.status, 200);
      assert.equal(result.data.data.path, '/integration-runtime');
      assert.ok(
        result.data.data.backendInstances.every(
          (backend) => backend.health.status === 'healthy'
        )
      );

      const invalidStrategy = await request(baseUrl, `/api/gateway/routes/${routeId}`, {
        method: 'PUT',
        body: { loadBalancingStrategy: 'weighted' },
      });
      assert.equal(invalidStrategy.response.status, 400);

      const conflictingName = await request(baseUrl, '/api/gateway/routes', {
        method: 'POST',
        body: {
          name: 'Integration Runtime Route',
          path: '/another-route',
          target: `http://127.0.0.1:${portOne}`,
          methods: ['GET'],
        },
      });
      assert.equal(conflictingName.response.status, 409);

      let proxied = await fetch(`${baseUrl}/integration-runtime`);
      assert.equal((await proxied.json()).upstream, 'one');
      proxied = await fetch(`${baseUrl}/integration-runtime`);
      assert.equal((await proxied.json()).upstream, 'two');

      result = await request(baseUrl, `/api/gateway/routes/${routeId}`, {
        method: 'PUT',
        body: { loadBalancingStrategy: 'least_connections' },
      });
      assert.equal(result.response.status, 200);
      await new Promise((resolve) => upstreamOne.close(resolve));
      await backendHealthMonitor.checkAll();
      await backendHealthMonitor.checkAll();
      let route = registry.matchRoute('/integration-runtime', 'GET').route;
      assert.equal(
        backendHealthMonitor.getBackendHealth(
          route,
          route.backendInstances.find((backend) => backend.id === 'one')
        ).status,
        'unhealthy'
      );
      proxied = await fetch(`${baseUrl}/integration-runtime`);
      assert.equal((await proxied.json()).upstream, 'two');

      upstreamOne = createUpstream('one');
      await new Promise((resolve, reject) => {
        upstreamOne.once('error', reject);
        upstreamOne.listen(portOne, '127.0.0.1', resolve);
      });
      await backendHealthMonitor.checkAll();
      route = registry.matchRoute('/integration-runtime', 'GET').route;
      assert.equal(
        backendHealthMonitor.getBackendHealth(
          route,
          route.backendInstances.find((backend) => backend.id === 'one')
        ).status,
        'healthy'
      );
      proxied = await fetch(`${baseUrl}/integration-runtime`);
      assert.equal((await proxied.json()).upstream, 'one');
      await request(baseUrl, `/api/gateway/routes/${routeId}`, {
        method: 'PUT',
        body: { loadBalancingStrategy: 'round_robin' },
      });

      result = await request(baseUrl, `/api/gateway/routes/${routeId}`, {
        method: 'PUT',
        body: {
          target: `http://127.0.0.1:${portTwo}`,
          description: 'Updated dynamically',
        },
      });
      assert.equal(result.response.status, 200);
      proxied = await fetch(`${baseUrl}/integration-runtime`);
      assert.equal((await proxied.json()).upstream, 'two');

      result = await request(baseUrl, `/api/gateway/routes/${routeId}`, {
        method: 'PUT',
        body: {
          backendInstances: [
            { id: 'one', target: `http://127.0.0.1:${portOne}`, enabled: false },
            { id: 'two', target: `http://127.0.0.1:${portTwo}`, enabled: true },
          ],
          loadBalancingStrategy: 'random',
        },
      });
      assert.equal(result.response.status, 200);
      assert.equal(result.data.data.loadBalancingStrategy, 'random');
      assert.equal(
        result.data.data.backendInstances.find((backend) => backend.id === 'one').enabled,
        false
      );
      await backendHealthMonitor.checkAll();
      for (let index = 0; index < 3; index += 1) {
        proxied = await fetch(`${baseUrl}/integration-runtime`);
        assert.equal((await proxied.json()).upstream, 'two');
      }

      result = await request(baseUrl, `/api/gateway/routes/${routeId}`, {
        method: 'PUT',
        body: {
          backendInstances: [
            { id: 'one', target: `http://127.0.0.1:${portOne}`, enabled: true },
          ],
          loadBalancingStrategy: 'least_connections',
        },
      });
      assert.equal(result.response.status, 200);
      assert.equal(result.data.data.backendInstances.length, 1);
      assert.equal(result.data.data.loadBalancingStrategy, 'least_connections');
      await backendHealthMonitor.checkAll();
      proxied = await fetch(`${baseUrl}/integration-runtime`);
      assert.equal((await proxied.json()).upstream, 'one');

      const previousTarget = registry.matchRoute('/integration-runtime', 'GET').route.target;
      const conflictingPath = await request(baseUrl, `/api/gateway/routes/${routeId}`, {
        method: 'PUT',
        body: { path: '/api/users' },
      });
      assert.equal(conflictingPath.response.status, 409);
      assert.equal((await Route.findById(routeId)).path, '/integration-runtime');
      assert.equal(registry.matchRoute('/integration-runtime', 'GET').route.target, previousTarget);

      result = await request(baseUrl, `/api/gateway/routes/${routeId}/toggle`, {
        method: 'PATCH',
        body: { enabled: false },
      });
      assert.equal(result.response.status, 200);
      assert.equal((await fetch(`${baseUrl}/integration-runtime`)).status, 404);

      result = await request(baseUrl, `/api/gateway/routes/${routeId}/toggle`, {
        method: 'PATCH',
        body: { enabled: true },
      });
      assert.equal(result.response.status, 200);
      await backendHealthMonitor.checkAll();
      assert.equal((await fetch(`${baseUrl}/integration-runtime`)).status, 200);

      const restartCheck = spawnSync(
        process.execPath,
        [
          '-e',
          `const mongoose = require('mongoose');
const { connectDatabase } = require('./src/config/db');
const routeService = require('./src/services/routeService');
const registry = require('./src/services/routeRegistry');
(async () => {
  if (!(await connectDatabase())) throw new Error('test database connection failed');
  await routeService.initializeRouteSystem();
  const route = registry.matchRoute('/integration-runtime', 'GET').route;
  if (!route || route._id !== process.env.GATEWAY_TEST_ROUTE_ID) {
    throw new Error('route was not restored from persistent storage');
  }
  console.log('Route restored by a fresh gateway process');
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});`,
        ],
        {
          cwd: path.resolve(__dirname, '..'),
          env: {
            ...process.env,
            MONGODB_URI: env.mongoUri,
            GATEWAY_TEST_ROUTE_ID: routeId,
          },
          encoding: 'utf8',
          timeout: 15000,
        }
      );
      assert.equal(restartCheck.status, 0, restartCheck.stderr);
      assert.match(restartCheck.stdout, /Route restored by a fresh gateway process/);

      registry.markInitializationFailure(new Error('simulated gateway restart'));
      result = await request(baseUrl, '/api/gateway/routes/refresh', { method: 'POST' });
      assert.equal(result.response.status, 200);
      assert.equal(registry.matchRoute('/integration-runtime', 'GET').route.target, previousTarget);
      assert.equal(await Route.countDocuments({ _id: routeId }), 1);

      result = await request(baseUrl, `/api/gateway/routes/${routeId}`, { method: 'DELETE' });
      assert.equal(result.response.status, 200);
      assert.equal(await Route.countDocuments({ _id: routeId }), 0);
      assert.equal(registry.matchRoute('/integration-runtime', 'GET').route, null);

      await mongoose.disconnect();
      result = await request(baseUrl, '/api/gateway/routes');
      assert.equal(result.response.status, 503);

      result = await request(baseUrl, '/api/gateway/routes/refresh', { method: 'POST' });
      assert.equal(result.response.status, 200);
      assert.equal(registry.getStats().status, 'loaded');
      assert.equal(registry.getStats().totalRoutes, 4);
    } finally {
      await close(gateway);
      await close(upstreamOne);
      await close(upstreamTwo);
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
      }
      env.mongoUri = originalMongoUri;
    }
  }
);
