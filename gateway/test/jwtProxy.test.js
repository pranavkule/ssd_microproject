const http = require('node:http');
const express = require('express');
const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../src/services/routeRegistry');
const backendHealthMonitor = require('../src/services/backendHealthMonitor');
const { createProxyRoutes } = require('../src/routes/proxyRoutes');
const errorHandler = require('../src/middleware/errorHandler');
const { createJwtAuthenticator } = require('../src/services/jwtAuthentication');
let SignJWT;
let exportJWK;
let generateKeyPair;

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => {
    if (!server?.listening) return resolve();
    server.close(resolve);
  });
}

test.before(async () => {
  ({ SignJWT, exportJWK, generateKeyPair } = await import('jose'));
});

test('rejects protected traffic before backend selection and permits valid/public traffic', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  const publicJwk = await exportJWK(publicKey);
  const jwks = {
    keys: [{ ...publicJwk, kid: 'proxy-test-key', alg: 'RS256', use: 'sig' }],
  };
  const authenticator = createJwtAuthenticator({
    configuration: {
      jwtAlgorithm: 'RS256',
      jwtIssuer: 'proxy-test-issuer',
      jwtAudience: 'proxy-test-audience',
    },
    secretProvider: { getJwks: () => jwks },
  });
  await authenticator.initialize();

  let upstreamHits = 0;
  const upstream = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200).end();
      return;
    }
    upstreamHits += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ url: req.url, authorization: req.headers.authorization || null }));
  });
  const upstreamPort = await listen(upstream);
  const app = express();
  app.use(createProxyRoutes({ authenticator }));
  app.use(errorHandler);
  const gateway = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => gateway.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${gateway.address().port}`;
  const protectedRoute = {
    id: '000000000000000000000081',
    name: 'Protected proxy test',
    path: '/protected-proxy-test',
    target: `http://127.0.0.1:${upstreamPort}`,
    methods: ['GET', 'HEAD'],
    enabled: true,
    stripPrefix: false,
    authRequired: true,
    requiredRoles: ['admin'],
  };
  const publicRoute = {
    ...protectedRoute,
    id: '000000000000000000000082',
    name: 'Public proxy test',
    path: '/public-proxy-test',
    authRequired: false,
    requiredRoles: [],
  };
  registry.upsertRoute(protectedRoute);
  registry.upsertRoute(publicRoute);

  async function token(roles = ['admin']) {
    return new SignJWT({ roles })
      .setProtectedHeader({ alg: 'RS256', kid: 'proxy-test-key' })
      .setSubject('proxy-test-user')
      .setIssuedAt()
      .setIssuer('proxy-test-issuer')
      .setAudience('proxy-test-audience')
      .setExpirationTime('5m')
      .sign(privateKey);
  }

  try {
    await backendHealthMonitor.checkAll();
    let response = await fetch(`${baseUrl}${protectedRoute.path}`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
    assert.equal(upstreamHits, 0);

    response = await fetch(`${baseUrl}${protectedRoute.path}`, {
      headers: { authorization: 'Bearer malformed' },
    });
    assert.equal(response.status, 401);
    assert.equal(upstreamHits, 0);

    response = await fetch(`${baseUrl}${protectedRoute.path}`, {
      headers: { authorization: `Bearer ${await token(['reader'])}` },
    });
    assert.equal(response.status, 403);
    assert.equal(upstreamHits, 0);

    const validToken = await token();
    response = await fetch(`${baseUrl}${protectedRoute.path}?q=1`, {
      headers: { authorization: `Bearer ${validToken}` },
    });
    assert.equal(response.status, 200);
    const forwarded = await response.json();
    assert.equal(forwarded.url, `${protectedRoute.path}?q=1`);
    assert.equal(forwarded.authorization, `Bearer ${validToken}`);
    assert.equal(upstreamHits, 1);

    response = await fetch(`${baseUrl}${publicRoute.path}`);
    assert.equal(response.status, 200);
    assert.equal(upstreamHits, 2);
  } finally {
    registry.removeRoute(protectedRoute.id);
    registry.removeRoute(publicRoute.id);
    await close(gateway);
    await close(upstream);
  }
});
