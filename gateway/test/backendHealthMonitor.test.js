const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHealthMonitor } = require('../src/services/backendHealthMonitor');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function makeRoute(target, overrides = {}) {
  return {
    _id: 'health-route',
    name: 'Health route',
    enabled: true,
    backendInstances: [{ id: 'backend', target, enabled: true }],
    ...overrides,
  };
}

test('tracks failure thresholds, recovery, disabled instances, and configuration cleanup', async () => {
  let healthy = true;
  const server = http.createServer((req, res) => {
    if (req.url === '/custom-health' && healthy) {
      res.writeHead(200).end();
    } else {
      res.writeHead(503).end();
    }
  });
  const port = await listen(server);
  const monitor = createHealthMonitor({
    checkPath: '/custom-health',
    timeoutMs: 200,
    failureThreshold: 2,
    recoveryThreshold: 2,
  });
  const route = makeRoute(`http://127.0.0.1:${port}`);
  const backend = route.backendInstances[0];

  try {
    monitor.syncRoutes([route]);
    await monitor.checkBackend(route, backend);
    await monitor.checkBackend(route, backend);
    assert.equal(monitor.getBackendHealth(route, backend).status, 'healthy');

    healthy = false;
    await monitor.checkBackend(route, backend);
    assert.equal(monitor.getBackendHealth(route, backend).healthy, true);
    await monitor.checkBackend(route, backend);
    assert.equal(monitor.getBackendHealth(route, backend).status, 'unhealthy');
    assert.equal(
      monitor.getBackendHealth(route, backend).consecutiveFailures,
      2
    );

    healthy = true;
    await monitor.checkBackend(route, backend);
    assert.equal(monitor.getBackendHealth(route, backend).healthy, false);
    await monitor.checkBackend(route, backend);
    assert.equal(monitor.getBackendHealth(route, backend).status, 'healthy');

    const disabledRoute = {
      ...route,
      backendInstances: [{ ...backend, enabled: false }],
    };
    monitor.syncRoutes([disabledRoute]);
    assert.equal(
      monitor.getBackendHealth(disabledRoute, disabledRoute.backendInstances[0]).status,
      'disabled'
    );
    monitor.syncRoutes([]);
    assert.deepEqual(monitor.getStatuses([]), []);
  } finally {
    monitor.stop();
    await close(server);
  }
});

test('times out health checks and does not overlap concurrent checks', async () => {
  let activeChecks = 0;
  let maxActiveChecks = 0;
  const server = http.createServer((_req, res) => {
    activeChecks += 1;
    maxActiveChecks = Math.max(maxActiveChecks, activeChecks);
    setTimeout(() => {
      activeChecks -= 1;
      if (!res.destroyed) {
        res.writeHead(200).end();
      }
    }, 100);
  });

  test('starts monitoring newly added backends and cleans state for removed backends', async () => {
    let healthRequests = 0;
    const server = http.createServer((_req, res) => {
      healthRequests += 1;
      res.writeHead(200).end();
    });
    const port = await listen(server);
    const monitor = createHealthMonitor({ timeoutMs: 200 });
    const route = makeRoute(`http://127.0.0.1:${port}`);
    const newBackend = {
      id: 'new-backend',
      target: `http://127.0.0.1:${port}`,
      enabled: true,
    };
    const expandedRoute = {
      ...route,
      backendInstances: [...route.backendInstances, newBackend],
    };

    try {
      monitor.syncRoutes([route]);
      await monitor.checkBackend(route, route.backendInstances[0]);
      const beforeAddition = healthRequests;

      monitor.syncRoutes([expandedRoute]);
      await monitor.checkBackend(expandedRoute, newBackend);
      assert.ok(healthRequests > beforeAddition);
      assert.equal(
        monitor.getBackendHealth(expandedRoute, newBackend).status,
        'healthy'
      );

      monitor.syncRoutes([route]);
      assert.equal(monitor.getBackendHealth(expandedRoute, newBackend).status, 'unknown');
    } finally {
      monitor.stop();
      await close(server);
    }
  });
  const port = await listen(server);
  const monitor = createHealthMonitor({
    timeoutMs: 20,
    failureThreshold: 1,
  });
  const route = makeRoute(`http://127.0.0.1:${port}`);
  const backend = route.backendInstances[0];

  try {
    monitor.syncRoutes([route]);
    await Promise.all([
      monitor.checkBackend(route, backend),
      monitor.checkBackend(route, backend),
    ]);
    assert.equal(monitor.getBackendHealth(route, backend).status, 'unhealthy');
    assert.equal(maxActiveChecks, 1);
    assert.equal(
      monitor.getBackendHealth(route, backend).lastError,
      'Backend health check timed out'
    );
  } finally {
    monitor.stop();
    await close(server);
  }
});
