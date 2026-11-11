import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mongoose = require('../../node_modules/mongoose');
const Payment = require('../../services/payment-service/src/models/Payment');
const GatewayRequestLog = require('../../gateway/src/models/GatewayRequestLog');
const baseUrl = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1').replace(/\/+$/, '');
const marker = `gw-smoke-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const created = { userIds: [], productIds: [], orderIds: [], paymentIds: [], routeIds: [] };
const smokeRequestIds = new Set();
const passed = [];
const failed = [];
let mongoConnected = false;
let cleanupDone = false;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json')
    ? await response.json()
    : await response.text();
  const pathname = new URL(url).pathname;
  const requestId = response.headers.get('x-request-id');
  if (requestId && pathname.startsWith('/api/') && !pathname.startsWith('/api/gateway/')) {
    smokeRequestIds.add(requestId);
  }
  return { response, data };
}

async function check(name, fn) {
  try {
    await fn();
    passed.push(name);
    console.log(`PASS ${name}`);
  } catch (error) {
    failed.push(name);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function issueToken(role, expiration = '5m', issuer = 'dynamic-api-gateway') {
  const { SignJWT, importPKCS8 } = await import('jose');
  const publicFile = process.env.JWT_LOCAL_JWKS_PATH
    || '/var/lib/dynamic-gateway/keys/public.jwks.json';
  const privateFile = process.env.JWT_DEMO_PRIVATE_KEY_PATH
    || '/var/lib/dynamic-gateway/keys/private.pem';
  const [jwks, privatePem] = await Promise.all([
    fs.readFile(publicFile, 'utf8').then(JSON.parse),
    fs.readFile(privateFile, 'utf8'),
  ]);
  const privateKey = await importPKCS8(privatePem, 'RS256');
  return new SignJWT({ roles: [role] })
    .setProtectedHeader({ alg: 'RS256', kid: jwks.keys[0].kid, typ: 'JWT' })
    .setSubject(marker)
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(process.env.JWT_AUDIENCE || 'dynamic-api-gateway')
    .setExpirationTime(expiration)
    .sign(privateKey);
}

async function main() {
  await check('MongoDB responds to ping', async () => {
    const mongoUri = process.env.MONGODB_URI
      || 'mongodb://127.0.0.1:27017/dynamic_api_gateway';
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    mongoConnected = true;
    await mongoose.connection.db.admin().ping();
  });

  for (const port of [5001, 5002, 5003, 5005, 5007]) {
    await check(`microservice health on loopback port ${port}`, async () => {
      const { response, data } = await request(`http://127.0.0.1:${port}/health`);
      assert(response.status === 200, `expected 200, got ${response.status}`);
      assert(data.status === 'running', 'service is not running');
      assert(data.database?.status === 'connected', 'service database is not connected');
    });
  }

  await check('service, MongoDB, and gateway listeners are loopback-only', async () => {
    const { execFileSync } = await import('node:child_process');
    const listeners = execFileSync('ss', ['-ltn'], { encoding: 'utf8' });
    for (const port of [27017, 5001, 5002, 5003, 5005, 5007, 8000]) {
      assert(
        new RegExp(`127\\.0\\.0\\.1:${port}\\b`).test(listeners),
        `expected port ${port} to bind only to 127.0.0.1`
      );
      assert(
        !new RegExp(`0\\.0\\.0\\.0:${port}\\b|\\[::\\]:${port}\\b`).test(listeners),
        `port ${port} is exposed on a public interface`
      );
    }
  });

  await check('Nginx serves dashboard and a localhost-free relative-API build', async () => {
    const { response, data } = await request(`${baseUrl}/`);
    assert(response.status === 200, `expected 200, got ${response.status}`);
    assert(typeof data === 'string' && data.includes('<div id="root">'), 'dashboard HTML not served');
    const asset = data.match(/src="([^"]+\.js)"/)?.[1];
    assert(asset, 'production JavaScript asset not referenced');
    const assetResponse = await fetch(new URL(asset, `${baseUrl}/`), {
      signal: AbortSignal.timeout(10000),
    });
    const assetText = await assetResponse.text();
    assert(assetResponse.status === 200, 'dashboard JavaScript asset not served');
    assert(!/localhost:8000|127\.0\.0\.1:8000/.test(assetText), 'built frontend contains localhost gateway URL');
    assert(assetText.includes('/api/gateway'), 'relative gateway API paths not found');
  });

  await check('React Router paths are served through Nginx fallback', async () => {
    for (const route of ['/routes', '/backends', '/load-balancing', '/health', '/activity-logs', '/settings']) {
      const { response, data } = await request(`${baseUrl}${route}`, {
        headers: { accept: 'text/html' },
      });
      assert(response.status === 200, `${route} returned ${response.status}`);
      assert(data.includes('<div id="root">'), `${route} did not return dashboard HTML`);
    }
  });

  await check('gateway health and MongoDB route registry are available through Nginx', async () => {
    const { response, data } = await request(`${baseUrl}/health`);
    assert(response.status === 200 && data.status === 'running', 'gateway health failed');
    assert(data.database.status === 'connected', 'gateway database is not connected');
    assert(data.routeRegistry.status === 'loaded', 'route registry is not loaded');
  });

  await check('default service proxy routes preserve successful responses and queries', async () => {
    for (const route of ['/api/users', '/api/products', '/api/orders', '/api/payments']) {
      const { response, data } = await request(`${baseUrl}${route}?limit=1`);
      assert(response.status === 200, `${route} returned ${response.status}`);
      assert(data.success === true, `${route} did not return the service response`);
    }
  });

  await check('dynamic routes are persisted and refreshable', async () => {
    const list = await request(`${baseUrl}/api/gateway/routes`);
    assert(list.response.status === 200, `routes returned ${list.response.status}`);
    for (const routePath of ['/api/users', '/api/products', '/api/orders', '/api/payments']) {
      assert(list.data.data.some((route) => route.path === routePath), `${routePath} missing from registry`);
    }
    const refresh = await request(`${baseUrl}/api/gateway/routes/refresh`, { method: 'POST' });
    assert(refresh.response.status === 200, `refresh returned ${refresh.response.status}`);
  });

  let user;
  await check('User CRUD persists across both service instances', async () => {
    const createdUser = await request(`${baseUrl}/api/users`, {
      method: 'POST',
      body: { name: marker, email: `${marker}@example.invalid` },
    });
    assert(createdUser.response.status === 201, `create user returned ${createdUser.response.status}`);
    user = createdUser.data.data;
    created.userIds.push(user._id);
    const readFromSecond = await request(`http://127.0.0.1:5002/api/users/${user._id}`);
    assert(readFromSecond.response.status === 200, 'second User Service could not read shared user');
    const updated = await request(`${baseUrl}/api/users/${user._id}`, {
      method: 'PUT',
      body: { name: `${marker}-updated` },
    });
    assert(updated.response.status === 200, 'user update failed');
  });

  let product;
  await check('Product CRUD', async () => {
    const result = await request(`${baseUrl}/api/products`, {
      method: 'POST',
      body: {
        name: marker,
        description: 'temporary smoke test record',
        price: 1.25,
        category: 'smoke-test',
        stock: 1,
      },
    });
    assert(result.response.status === 201, `create product returned ${result.response.status}`);
    product = result.data.data;
    created.productIds.push(product._id);
    const read = await request(`${baseUrl}/api/products/${product._id}`);
    assert(read.response.status === 200, 'product read failed');
    const updated = await request(`${baseUrl}/api/products/${product._id}`, {
      method: 'PUT',
      body: { stock: 2 },
    });
    assert(updated.response.status === 200, 'product update failed');
  });

  let order;
  await check('Order CRUD and status update', async () => {
    assert(user && product, 'temporary user and product are required');
    const result = await request(`${baseUrl}/api/orders`, {
      method: 'POST',
      body: {
        userId: user._id,
        items: [{ productId: product._id, quantity: 1, price: 1.25 }],
        totalAmount: 1.25,
      },
    });
    assert(result.response.status === 201, `create order returned ${result.response.status}`);
    order = result.data.data;
    created.orderIds.push(order._id);
    const updated = await request(`${baseUrl}/api/orders/${order._id}/status`, {
      method: 'PATCH',
      body: { status: 'confirmed' },
    });
    assert(updated.response.status === 200, 'order status update failed');
    assert((await request(`${baseUrl}/api/orders/${order._id}`)).response.status === 200, 'order read failed');
  });

  if (order) {
    await check('Payment simulation', async () => {
      const transactionId = `${marker}-payment`;
      const payment = await request(`${baseUrl}/api/payments`, {
        method: 'POST',
        body: {
          orderId: order._id,
          amount: 1.25,
          paymentMethod: 'UPI',
          transactionId,
        },
      });
      assert(payment.response.status === 201, `create payment returned ${payment.response.status}`);
      created.paymentIds.push(transactionId);
      assert(['successful', 'failed'].includes(payment.data.data.status), 'payment returned an invalid state');
      assert((await request(`${baseUrl}/api/payments/${payment.data.data._id}`)).response.status === 200, 'payment read failed');
    });
  }

  const roundRobinPath = `/rr-smoke-${marker}`;
  let roundRobinRouteId;
  await check('Round Robin alternates between both healthy User Service instances', async () => {
    const createdRoute = await request(`${baseUrl}/api/gateway/routes`, {
      method: 'POST',
      body: {
        name: `Round Robin ${marker}`,
        path: roundRobinPath,
        target: 'http://127.0.0.1:5001/health',
        backendInstances: [
          { id: 'user-1', target: 'http://127.0.0.1:5001/health', enabled: true },
          { id: 'user-2', target: 'http://127.0.0.1:5002/health', enabled: true },
        ],
        loadBalancingStrategy: 'round_robin',
        methods: ['GET'],
        stripPrefix: true,
      },
    });
    assert(createdRoute.response.status === 201, `route creation returned ${createdRoute.response.status}`);
    roundRobinRouteId = createdRoute.data.data.id;
    created.routeIds.push(roundRobinRouteId);

    let active = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const current = await request(`${baseUrl}/api/gateway/routes/${roundRobinRouteId}`);
      if (current.data.data.backendInstances.every((backend) => backend.health.healthy)) {
        active = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(active, 'both User Service instances did not become healthy');

    const ports = [];
    for (let index = 0; index < 6; index++) {
      const { response, data } = await request(`${baseUrl}${roundRobinPath}`);
      assert(response.status === 200, `proxied health returned ${response.status}`);
      ports.push(data.port);
    }
    assert(ports.includes(5001) && ports.includes(5002), `requests did not reach both ports: ${ports.join(',')}`);
    for (let index = 2; index < ports.length; index++) {
      assert(ports[index] === ports[index - 2], `round robin did not alternate: ${ports.join(',')}`);
    }
  });

  if (process.env.SMOKE_TEST_FAILOVER === 'true') {
    await check('backend failure excludes the failed instance, returns 503 when both fail, and recovers', async () => {
      assert(typeof process.getuid === 'function' && process.getuid() === 0, 'failover mode must run as root');
      assert(roundRobinRouteId, 'Round Robin route must be available');
      const { execFileSync } = await import('node:child_process');
      const unit1 = 'user-service@5001.service';
      const unit2 = 'user-service@5002.service';
      const unitState = async (target) => {
        const result = await request(`${baseUrl}/api/gateway/routes/${roundRobinRouteId}`);
        const backend = result.data.data.backendInstances.find((item) => item.target === target);
        return backend?.health.healthy === true;
      };
      const target1 = 'http://127.0.0.1:5001/health';
      const target2 = 'http://127.0.0.1:5002/health';
      const waitFor = async (predicate, label) => {
        for (let attempt = 0; attempt < 30; attempt++) {
          if (await predicate()) return;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        throw new Error(`timed out waiting for ${label}`);
      };
      try {
        execFileSync('systemctl', ['stop', unit1], { stdio: 'pipe' });
        await waitFor(async () => !(await unitState(target1)) && await unitState(target2), 'primary health failure');
        for (let index = 0; index < 3; index++) {
          const result = await request(`${baseUrl}${roundRobinPath}`);
          assert(result.response.status === 200 && result.data.port === 5002, 'traffic was not failed over to the healthy instance');
        }
        execFileSync('systemctl', ['stop', unit2], { stdio: 'pipe' });
        await waitFor(async () => !(await unitState(target1)) && !(await unitState(target2)), 'all backends failing');
        const unavailable = await request(`${baseUrl}${roundRobinPath}`);
        assert(unavailable.response.status === 503, `all-backend failure returned ${unavailable.response.status}`);
      } finally {
        execFileSync('systemctl', ['start', unit1, unit2], { stdio: 'pipe' });
      }
      await waitFor(async () => await unitState(target1) && await unitState(target2), 'backend recovery');
      const recovered = await request(`${baseUrl}${roundRobinPath}`);
      assert(recovered.response.status === 200, 'recovered backend pool did not accept traffic');
    });
  }

  await check('upstream timeout maps to 504 and restores the persisted timeout setting', async () => {
    const http = await import('node:http');
    const slowServer = http.createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200).end();
        return;
      }
      setTimeout(() => res.writeHead(200).end('late response'), 3000);
    });
    await new Promise((resolve, reject) => {
      slowServer.once('error', reject);
      slowServer.listen(0, '127.0.0.1', resolve);
    });
    const port = slowServer.address().port;
    const routePath = `/timeout-smoke-${marker}`;
    let routeId;
    let originalTimeout;
    try {
      const config = await request(`${baseUrl}/api/gateway/config`);
      originalTimeout = config.data.data.settings.proxyTimeoutMs;
      const configured = await request(`${baseUrl}/api/gateway/config`, {
        method: 'PUT',
        body: { proxyTimeoutMs: 250 },
      });
      assert(configured.response.status === 200, 'could not set temporary proxy timeout');
      const route = await request(`${baseUrl}/api/gateway/routes`, {
        method: 'POST',
        body: {
          name: `Timeout smoke ${marker}`,
          path: routePath,
          target: `http://127.0.0.1:${port}`,
          methods: ['GET'],
        },
      });
      assert(route.response.status === 201, 'could not create timeout route');
      routeId = route.data.data.id;
      created.routeIds.push(routeId);
      for (let attempt = 0; attempt < 20; attempt++) {
        const current = await request(`${baseUrl}/api/gateway/routes/${routeId}`);
        if (current.data.data.backendInstances[0].health.healthy) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      const timedOut = await request(`${baseUrl}${routePath}`);
      assert(timedOut.response.status === 504, `timeout returned ${timedOut.response.status}`);
    } finally {
      if (originalTimeout) {
        const restored = await request(`${baseUrl}/api/gateway/config`, {
          method: 'PUT',
          body: { proxyTimeoutMs: originalTimeout },
        });
        assert(restored.response.status === 200, 'could not restore the original proxy timeout');
      }
      await new Promise((resolve) => slowServer.close(resolve));
    }
  });

  const routePath = `/smoke-${marker}`;
  await check('dynamic route CRUD, immediate updates, 405 Allow, and disabled routing', async () => {
    const createdRoute = await request(`${baseUrl}/api/gateway/routes`, {
      method: 'POST',
      body: {
        name: `Smoke ${marker}`,
        path: routePath,
        target: 'http://127.0.0.1:5003',
        methods: ['GET'],
        stripPrefix: false,
      },
    });
    assert(createdRoute.response.status === 201, `route creation returned ${createdRoute.response.status}`);
    const routeId = createdRoute.data.data.id;
    created.routeIds.push(routeId);
    const upstream = await request(`${baseUrl}${routePath}`);
    assert(upstream.response.status === 404, 'expected backend 404 for service root path');
    assert(String(upstream.data.message || '').includes(routePath), 'request did not reach selected backend');

    const method = await request(`${baseUrl}${routePath}`, { method: 'POST' });
    assert(method.response.status === 405, `unsupported method returned ${method.response.status}`);
    assert(method.response.headers.get('allow')?.includes('GET'), 'Allow header missing GET');

    const changed = await request(`${baseUrl}/api/gateway/routes/${routeId}`, {
      method: 'PUT',
      body: { target: 'http://127.0.0.1:5001' },
    });
    assert(changed.response.status === 200, 'route update failed');
    assert((await request(`${baseUrl}${routePath}`)).response.status === 404, 'updated route failed');

    const disabled = await request(`${baseUrl}/api/gateway/routes/${routeId}/toggle`, {
      method: 'PATCH',
      body: { enabled: false },
    });
    assert(disabled.response.status === 200, 'route disable failed');
    assert((await request(`${baseUrl}${routePath}`)).response.status === 404, 'disabled route remained active');
  });

  const authRoutePath = `/auth-smoke-${marker}`;
  await check('protected route rejects missing/invalid/expired tokens and enforces issuer and roles', async () => {
    const route = await request(`${baseUrl}/api/gateway/routes`, {
      method: 'POST',
      body: {
        name: `Auth smoke ${marker}`,
        path: authRoutePath,
        target: 'http://127.0.0.1:5003',
        methods: ['GET'],
        authRequired: true,
        requiredRoles: ['admin'],
      },
    });
    assert(route.response.status === 201, `auth route creation returned ${route.response.status}`);
    const routeId = route.data.data.id;
    created.routeIds.push(routeId);
    assert((await fetch(`${baseUrl}${authRoutePath}`)).status === 401, 'missing token was not rejected');
    assert((await fetch(`${baseUrl}${authRoutePath}`, {
      headers: { authorization: 'Bearer invalid-token' },
    })).status === 401, 'invalid token was not rejected');

    const expired = await issueToken('admin', '-1s');
    assert((await fetch(`${baseUrl}${authRoutePath}`, {
      headers: { authorization: `Bearer ${expired}` },
    })).status === 401, 'expired token was not rejected');
    const wrongIssuer = await issueToken('admin', '5m', 'wrong-issuer');
    assert((await fetch(`${baseUrl}${authRoutePath}`, {
      headers: { authorization: `Bearer ${wrongIssuer}` },
    })).status === 401, 'wrong issuer was not rejected');

    const userToken = await issueToken('user');
    assert((await fetch(`${baseUrl}${authRoutePath}`, {
      headers: { authorization: `Bearer ${userToken}` },
    })).status === 403, 'insufficient role was not rejected');
    const updated = await request(`${baseUrl}/api/gateway/routes/${routeId}`, {
      method: 'PUT',
      body: { requiredRoles: ['user'] },
    });
    assert(updated.response.status === 200, 'protected route role update failed');
    const accepted = await fetch(`${baseUrl}${authRoutePath}`, {
      headers: { authorization: `Bearer ${userToken}` },
    });
    assert(accepted.status === 404, `valid token did not reach backend (status ${accepted.status})`);
  });

  await check('gateway metrics, persisted request logs, and configuration are live', async () => {
    const [metrics, logs, settings] = await Promise.all([
      request(`${baseUrl}/api/gateway/metrics`),
      request(`${baseUrl}/api/gateway/logs?limit=10`),
      request(`${baseUrl}/api/gateway/config`),
    ]);
    assert(metrics.response.status === 200 && metrics.data.data.totalRequests > 0, 'gateway metrics are empty');
    assert(logs.response.status === 200 && logs.data.data.length > 0, 'persisted request logs are empty');
    assert(settings.response.status === 200 && settings.data.data, 'gateway configuration is unavailable');
  });

  await check('configuration, routes, application data, and request logs persist across service restarts', async () => {
    const configBefore = await request(`${baseUrl}/api/gateway/config`);
    assert(configBefore.response.status === 200, 'could not read persisted configuration');
    const settings = configBefore.data.data.settings;
    const configUpdate = await request(`${baseUrl}/api/gateway/config`, {
      method: 'PUT',
      body: settings,
    });
    assert(configUpdate.response.status === 200, 'could not persist effective configuration');

    if (product) {
      const { execFileSync } = await import('node:child_process');
      execFileSync('systemctl', ['restart', 'product-service'], { stdio: 'pipe' });
      const productRead = await request(`${baseUrl}/api/products/${product._id}`);
      assert(productRead.response.status === 200, 'product data did not survive service restart');
    }

    const routeId = roundRobinRouteId;
    assert(routeId, 'temporary route is required for persistence validation');
    const routeRead = await request(`${baseUrl}/api/gateway/routes/${routeId}`);
    assert(routeRead.response.status === 200, 'temporary route could not be read before restart');
    const routePath = routeRead.data.data.path;
    await request(`${baseUrl}${routePath}`);

    const { execFileSync } = await import('node:child_process');
    execFileSync('systemctl', ['restart', 'gateway'], { stdio: 'pipe' });
    let health;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        const result = await request(`${baseUrl}/health`);
        if (result.response.status === 200 && result.data.routeRegistry.status === 'loaded') {
          health = result.data;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(health, 'gateway did not reload its route registry after restart');
    const persistedRoute = await request(`${baseUrl}/api/gateway/routes/${routeId}`);
    assert(persistedRoute.response.status === 200, 'route did not survive gateway restart');
    const persistedConfig = await request(`${baseUrl}/api/gateway/config`);
    assert(
      JSON.stringify(persistedConfig.data.data.settings) === JSON.stringify(settings),
      'gateway settings did not survive gateway restart'
    );
    let persistedLog = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const logs = await request(`${baseUrl}/api/gateway/logs?route=${routeId}&limit=10`);
      if (logs.response.status === 200 && logs.data.data.length) {
        persistedLog = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert(persistedLog, 'request log did not survive gateway restart');
  });

  await check('CORS preflight is answered by the gateway', async () => {
    const { response } = await request(`${baseUrl}/api/products`, {
      method: 'OPTIONS',
      headers: {
        origin: baseUrl,
        'access-control-request-method': 'GET',
      },
    });
    assert(response.status === 204, `preflight returned ${response.status}`);
  });

  try {
    await cleanup();
  } catch (error) {
    failed.push('cleanup of smoke-test records');
    console.error(`FAIL cleanup of smoke-test records: ${error.message}`);
  }
  console.log(`\nSmoke test summary: ${passed.length} passed, ${failed.length} failed.`);
  if (failed.length) process.exitCode = 1;
}

async function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;
  const errors = [];
  async function remove(label, operation) {
    try {
      const { response } = await operation();
      assert([200, 404].includes(response.status), `HTTP ${response.status}`);
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  for (const routeId of created.routeIds) {
    await remove(`route ${routeId}`, () =>
      request(`${baseUrl}/api/gateway/routes/${routeId}`, { method: 'DELETE' }));
  }
  for (const id of created.orderIds) {
    await remove(`order ${id}`, () => request(`${baseUrl}/api/orders/${id}`, { method: 'DELETE' }));
  }
  for (const id of created.productIds) {
    await remove(`product ${id}`, () => request(`${baseUrl}/api/products/${id}`, { method: 'DELETE' }));
  }
  for (const id of created.userIds) {
    await remove(`user ${id}`, () => request(`${baseUrl}/api/users/${id}`, { method: 'DELETE' }));
  }
  if (mongoConnected && created.paymentIds.length) {
    try {
      const result = await Payment.deleteMany({ transactionId: { $in: created.paymentIds } });
      assert(
        result.deletedCount === created.paymentIds.length,
        `expected to remove ${created.paymentIds.length} smoke payment(s), removed ${result.deletedCount}`
      );
    } catch (error) {
      errors.push(`payments: ${error.message}`);
    }
  }
  if (mongoConnected && smokeRequestIds.size) {
    try {
      const requestIds = [...smokeRequestIds];
      let found = 0;
      for (let attempt = 0; attempt < 50; attempt++) {
        found = await GatewayRequestLog.countDocuments({ requestId: { $in: requestIds } });
        if (found === requestIds.length) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (found !== requestIds.length) {
        errors.push(`request logs: persisted ${found} of ${requestIds.length} smoke requests`);
      }
      await GatewayRequestLog.deleteMany({
        $or: [
          { requestId: { $in: requestIds } },
          { path: { $regex: marker } },
        ],
      });
    } catch (error) {
      errors.push(`request logs: ${error.message}`);
    }
  }
  if (mongoConnected) {
    try {
      await mongoose.disconnect();
    } catch (error) {
      errors.push(`MongoDB disconnect: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
}

process.on('SIGINT', () => {
  console.error('\nInterrupted; attempting scoped cleanup.');
  cleanup().finally(() => process.exit(130));
});

main().catch(async (error) => {
  console.error(`Smoke test could not complete: ${error.message}`);
  try {
    await cleanup();
  } catch (cleanupError) {
    console.error(`Cleanup failed: ${cleanupError.message}`);
  }
  process.exitCode = 1;
});
