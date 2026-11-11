import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { getJwtTestVerdict, sendJwtTestRequest } from '../src/utils/jwtPlayground.js';

test('JWT playground distinguishes authentication and authorization outcomes', () => {
  assert.equal(getJwtTestVerdict(200, false, false).success, true);
  assert.match(getJwtTestVerdict(200, false, false).label, /does not require authentication/);
  assert.equal(getJwtTestVerdict(401, true, true).success, false);
  assert.match(getJwtTestVerdict(401, true, true).label, /Authentication failed/);
  assert.equal(getJwtTestVerdict(403, true, true).success, false);
  assert.match(getJwtTestVerdict(403, true, true).label, /role authorization failed/);
  assert.equal(getJwtTestVerdict(200, true, true).success, true);
  assert.match(getJwtTestVerdict(200, true, true).label, /Authentication succeeded/);
});

test('JWT playground sends bearer tokens to the selected API and renders real responses', async () => {
  const server = http.createServer((request, response) => {
    const bearer = request.headers.authorization;
    const status = !bearer ? 401 : bearer === 'Bearer invalid' ? 401 : bearer === 'Bearer user' ? 403 : 200;
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ received: bearer || null, status }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/protected`;
  try {
    const unauthorized = await sendJwtTestRequest({ url, token: '', authRequired: true });
    const denied = await sendJwtTestRequest({ url, token: 'user', authRequired: true });
    const authorized = await sendJwtTestRequest({ url, token: 'valid', authRequired: true });
    assert.equal(unauthorized.status, 401);
    assert.equal(denied.status, 403);
    assert.equal(authorized.status, 200);
    assert.deepEqual(authorized.body, { received: 'Bearer valid', status: 200 });
    assert.equal(authorized.verdict.success, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
