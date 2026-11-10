const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const Route = require('../src/models/Route');
const app = require('../src/app');
const registry = require('../src/services/routeRegistry');
const backendHealthMonitor = require('../src/services/backendHealthMonitor');

let gateway;
let upstream;
let upstreamPort;
let hitCount = 0;
let nextId = 100;
const delayedResponses = new Set();

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
  return new Promise((resolve) => server.close(resolve));
}

function newRoute(overrides = {}) {
  const id = (nextId++).toString(16).padStart(24, '0');
  return {
    id,
    name: `Proxy ${id}`,
    path: `/proxy-${id}`,
    target: `http://127.0.0.1:${upstreamPort}`,
    methods: ['GET'],
    enabled: true,
    stripPrefix: false,
    ...overrides,
  };
}

async function withRoute(route, callback) {
  registry.upsertRoute(route);
  try {
    await backendHealthMonitor.checkAll();
    await callback();
  } finally {
    registry.removeRoute(route.id);
  }
}

test.before(async () => {
  const originalFind = Route.find;
  Route.find = () => ({ lean: async () => [] });
  try {
    await registry.loadFromDatabase();
  } finally {
    Route.find = originalFind;
  }

  upstream = http.createServer((req, res) => {
    hitCount += 1;
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      if (req.url.endsWith('/hang')) {
        const timer = setTimeout(() => {
          delayedResponses.delete(timer);
          if (!res.destroyed) {
            res.end('late');
          }
        }, 12000);
        delayedResponses.add(timer);
        return;
      }

      const body = JSON.stringify({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString(),
      });
      res.writeHead(req.method === 'POST' ? 201 : 200, {
        'content-type': 'application/json',
        'x-upstream-response': 'preserved',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    });
  });
  upstreamPort = await listen(upstream);
  gateway = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => gateway.once('listening', resolve));
});

test.after(async () => {
  for (const timer of delayedResponses) {
    clearTimeout(timer);
  }
  if (gateway) {
    await close(gateway);
  }
  if (upstream) {
    await close(upstream);
  }
});

test('selects dynamic targets and preserves path, query, headers, body, status, and response headers', async () => {
  const route = newRoute({ methods: ['POST'] });
  await withRoute(route, async () => {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}${route.path}/items?q=1`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'x-client-header': 'retained' },
      body: 'request-body',
    });
    const result = await response.json();

    assert.equal(response.status, 201);
    assert.equal(response.headers.get('x-upstream-response'), 'preserved');
    assert.equal(result.method, 'POST');
    assert.equal(result.url, `${route.path}/items?q=1`);
    assert.equal(result.headers['x-client-header'], 'retained');
    assert.equal(result.body, 'request-body');
  });
});

test('preserves the full path with stripPrefix false and target base path with stripPrefix true', async () => {
  const passThrough = newRoute({ path: '/keep-prefix', methods: ['GET'] });
  await withRoute(passThrough, async () => {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/keep-prefix/a?q=2`);
    assert.equal((await response.json()).url, '/keep-prefix/a?q=2');
  });

  const stripped = newRoute({
    path: '/remove-prefix',
    target: `http://127.0.0.1:${upstreamPort}/base`,
    stripPrefix: true,
  });
  await withRoute(stripped, async () => {
    const nested = await fetch(`http://127.0.0.1:${gateway.address().port}/remove-prefix/a?q=2`);
    assert.equal((await nested.json()).url, '/base/a?q=2');
    const exact = await fetch(`http://127.0.0.1:${gateway.address().port}/remove-prefix?q=2`);
    assert.equal((await exact.json()).url, '/base?q=2');
  });
});

test('returns 404 for unmatched paths and 405 with Allow for unsupported methods', async () => {
  const unmatched = await fetch(`http://127.0.0.1:${gateway.address().port}/no-route`);
  assert.equal(unmatched.status, 404);
  assert.equal((await unmatched.json()).error, 'ROUTE_NOT_FOUND');

  const route = newRoute({ path: '/method-test', methods: ['GET', 'HEAD'] });
  await withRoute(route, async () => {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/method-test`, {
      method: 'POST',
    });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  });
});

test('forwards HEAD and returns no response body', async () => {
  const route = newRoute({ path: '/head-test', methods: ['GET', 'HEAD'] });
  await withRoute(route, async () => {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/head-test`, {
      method: 'HEAD',
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-upstream-response'), 'preserved');
    assert.equal(await response.text(), '');
  });
});

test('distributes proxy requests across healthy backend instances', async () => {
  const secondBackend = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('second');
    });
  });
  const secondPort = await listen(secondBackend);
  const route = newRoute({
    path: '/balanced',
    backendInstances: [
      { id: 'one', target: `http://127.0.0.1:${upstreamPort}`, enabled: true },
      { id: 'two', target: `http://127.0.0.1:${secondPort}`, enabled: true },
    ],
    loadBalancingStrategy: 'round_robin',
  });

  try {
    await withRoute(route, async () => {
      const first = await fetch(`http://127.0.0.1:${gateway.address().port}/balanced`);
      const second = await fetch(`http://127.0.0.1:${gateway.address().port}/balanced`);
      assert.equal((await first.json()).url, '/balanced');
      assert.equal(await second.text(), 'second');
    });
  } finally {
    await close(secondBackend);
  }
});

test('handles browser preflight in the gateway and forwards explicit upstream OPTIONS', async () => {
  const route = newRoute({ path: '/options-test', methods: ['GET', 'OPTIONS'] });
  await withRoute(route, async () => {
    const hitsBeforePreflight = hitCount;
    const preflight = await fetch(`http://127.0.0.1:${gateway.address().port}/options-test`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(hitCount, hitsBeforePreflight);

    const explicitOptions = await fetch(`http://127.0.0.1:${gateway.address().port}/options-test`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173' },
    });
    assert.equal(explicitOptions.status, 200);
    assert.equal((await explicitOptions.json()).method, 'OPTIONS');
    assert.equal(hitCount, hitsBeforePreflight + 1);
  });
});

test('returns 503 when all configured backends are unhealthy', async () => {
  const route = newRoute({
    path: '/all-unhealthy',
    target: 'http://127.0.0.1:1',
  });
  await withRoute(route, async () => {
    const response = await fetch(
      `http://127.0.0.1:${gateway.address().port}/all-unhealthy`
    );
    const result = await response.json();
    assert.equal(response.status, 503);
    assert.equal(result.error, 'NO_HEALTHY_BACKENDS');
    assert.match(result.message, /No healthy backend/);
  });
});

test('health reports dynamic enabled and disabled routes without static service entries', async () => {
  const enabled = newRoute({ path: '/health-enabled' });
  const disabled = newRoute({
    path: '/health-disabled',
    target: 'http://user:secret@localhost:5000',
    enabled: false,
  });
  registry.upsertRoute(enabled);
  registry.upsertRoute(disabled);
  try {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/health`);
    const health = await response.json();
    assert.equal(health.routeRegistry.totalRoutes, 2);
    assert.equal(health.routeRegistry.enabledRoutes, 1);
    assert.equal(health.routeRegistry.disabledRoutes, 1);
    assert.equal(health.loadBalancing.totalBackends, 2);
    assert.equal(health.loadBalancing.disabledBackends, 1);
    assert.equal(health.routes.length, 2);
    assert.equal(
      health.routes.find((route) => route.name === disabled.name).backends[0].health.status,
      'disabled'
    );
    assert.deepEqual(
      health.services.map((service) => service.name).sort(),
      [enabled.name, disabled.name].sort()
    );
    assert.equal(
      health.services.find((service) => service.name === enabled.name).url,
      new URL(enabled.target).toString()
    );
    assert.ok(
      health.services.every((service) => !service.url.includes('secret'))
    );
    assert.ok(health.database);
    assert.equal(health.status, 'running');
  } finally {
    registry.removeRoute(enabled.id);
    registry.removeRoute(disabled.id);
  }
});

test('returns safe 502 and 504 responses for upstream failures', { timeout: 20000 }, async () => {
  const resetBackend = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end();
    } else {
      req.socket.destroy();
    }
  });
  const resetPort = await listen(resetBackend);
  const resetRoute = newRoute({
    path: '/reset',
    target: `http://127.0.0.1:${resetPort}`,
  });
  await withRoute(resetRoute, async () => {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/reset`);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, 'SERVICE_UNAVAILABLE');
  });
  await close(resetBackend);

  const timeoutBackend = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end();
    }
  });
  const timeoutPort = await listen(timeoutBackend);
  const timeout = newRoute({ path: '/timeout' });
  timeout.target = `http://127.0.0.1:${timeoutPort}`;
  await withRoute(timeout, async () => {
    const response = await fetch(`http://127.0.0.1:${gateway.address().port}/timeout`);
    assert.equal(response.status, 504);
    assert.equal((await response.json()).error, 'GATEWAY_TIMEOUT');
  });
  await close(timeoutBackend);
});
