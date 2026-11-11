const test = require('node:test');
const assert = require('node:assert/strict');

const ISSUER = 'gateway-test-issuer';
const AUDIENCE = 'gateway-test-audience';
const KID = 'gateway-test-key';
let SignJWT;
let privateKey;
let otherPrivateKey;
let otherPublicJwk;
let jwks;

test.before(async () => {
  const { exportJWK, generateKeyPair } = await import('jose');
  ({ SignJWT } = await import('jose'));
  const generated = await generateKeyPair('RS256', { modulusLength: 2048 });
  const other = await generateKeyPair('RS256', { modulusLength: 2048 });
  privateKey = generated.privateKey;
  otherPrivateKey = other.privateKey;
  otherPublicJwk = await exportJWK(other.publicKey);
  const publicJwk = await exportJWK(generated.publicKey);
  jwks = { keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] };
});

function createAuthenticator(availableJwks = jwks) {
  return require('../src/services/jwtAuthentication').createJwtAuthenticator({
    configuration: {
      jwtAlgorithm: 'RS256',
      jwtIssuer: ISSUER,
      jwtAudience: AUDIENCE,
    },
    secretProvider: { getJwks: () => availableJwks },
  });
}

async function createToken(options = {}) {
  const token = new SignJWT(options.claims || { roles: ['operator'] })
    .setProtectedHeader(options.header || { alg: 'RS256', kid: KID });
  if (options.subject !== null) token.setSubject(options.subject || 'test-user');
  if (options.issuedAt !== null) token.setIssuedAt(options.issuedAt ?? Math.floor(Date.now() / 1000));
  if (options.expiration !== null) token.setExpirationTime(options.expiration ?? '5m');
  token.setIssuer(options.issuer || ISSUER);
  token.setAudience(options.audience || AUDIENCE);
  const signingKey = options.signingKey ||
    (options.header?.alg === 'HS256'
      ? new TextEncoder().encode('test-only-invalid-algorithm')
      : privateKey);
  return token.sign(signingKey);
}

async function authorize(token, route = { authRequired: true, requiredRoles: [] }) {
  const authenticator = createAuthenticator();
  await authenticator.initialize();
  const request = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  await authenticator.authorize(request, route);
  return request;
}

test('allows public routes without loading or requiring a token', async () => {
  await assert.doesNotReject(() =>
    authorize(null, { authRequired: false, requiredRoles: [] })
  );
});

test('rejects missing and malformed bearer authorization', async () => {
  await assert.rejects(authorize(null), { statusCode: 401, errorCode: 'AUTHENTICATION_REQUIRED' });
  const authenticator = createAuthenticator();
  await authenticator.initialize();
  await assert.rejects(
    authenticator.authorize(
      { headers: { authorization: 'Basic token' } },
      { authRequired: true, requiredRoles: [] }
    ),
    { statusCode: 401, errorCode: 'AUTHENTICATION_REQUIRED' }
  );
});

test('accepts a valid RSA JWT and preserves only its subject in request state', async () => {
  const request = await authorize(await createToken());
  assert.deepEqual(request.gatewayIdentity, { subject: 'test-user' });
});

test('rejects malformed, expired, incorrectly signed, and unsupported-algorithm tokens', async () => {
  await assert.rejects(authorize('not-a-jwt'), { statusCode: 401, errorCode: 'INVALID_TOKEN' });
  await assert.rejects(
    authorize(await createToken({ expiration: Math.floor(Date.now() / 1000) - 30 })),
    { statusCode: 401, errorCode: 'INVALID_TOKEN' }
  );
  await assert.rejects(
    authorize(await createToken({ signingKey: otherPrivateKey })),
    { statusCode: 401, errorCode: 'INVALID_TOKEN' }
  );
  await assert.rejects(
    authorize(await createToken({ header: { alg: 'HS256', kid: KID } })),
    { statusCode: 401, errorCode: 'INVALID_TOKEN' }
  );
});

test('rejects incorrect issuer, audience, and missing required claims', async () => {
  await assert.rejects(
    authorize(await createToken({ issuer: 'other-issuer' })),
    { statusCode: 401, errorCode: 'INVALID_TOKEN' }
  );
  await assert.rejects(
    authorize(await createToken({ audience: 'other-audience' })),
    { statusCode: 401, errorCode: 'INVALID_TOKEN' }
  );
  await assert.rejects(
    authorize(await createToken({ subject: null })),
    { statusCode: 401, errorCode: 'INVALID_TOKEN' }
  );
  await assert.rejects(
    authorize(await createToken({ issuedAt: null })),
    { statusCode: 401, errorCode: 'INVALID_TOKEN' }
  );
});

test('requires at least one configured role and supports role arrays or a single role', async () => {
  const route = { authRequired: true, requiredRoles: ['admin', 'operator'] };
  await assert.rejects(
    authorize(await createToken({ claims: { roles: ['reader'] } }), route),
    { statusCode: 403, errorCode: 'INSUFFICIENT_PERMISSIONS' }
  );
  await assert.doesNotReject(
    authorize(await createToken({ claims: { roles: ['operator'] } }), route)
  );
  await assert.doesNotReject(
    authorize(await createToken({ claims: { role: 'admin' } }), route)
  );
});

test('fails closed with 503 when verification material is unavailable', async () => {
  const authenticator = createAuthenticator(null);
  await authenticator.initialize();
  await assert.rejects(
    authenticator.authorize(
      { headers: {} },
      { authRequired: true, requiredRoles: [] }
    ),
    { statusCode: 503, errorCode: 'AUTH_VERIFICATION_UNAVAILABLE' }
  );
});

test('accepts overlapping keys after rotation and rejects a retired key', async () => {
  let activeJwks = jwks;
  const authenticator = require('../src/services/jwtAuthentication').createJwtAuthenticator({
    configuration: {
      jwtAlgorithm: 'RS256',
      jwtIssuer: ISSUER,
      jwtAudience: AUDIENCE,
    },
    secretProvider: { getJwks: () => activeJwks },
  });
  await authenticator.initialize();
  const oldToken = await createToken();
  await assert.doesNotReject(() =>
    authenticator.authorize(
      { headers: { authorization: `Bearer ${oldToken}` } },
      { authRequired: true, requiredRoles: [] }
    )
  );

  activeJwks = {
    keys: [
      ...jwks.keys,
      { ...otherPublicJwk, kid: 'rotated-key', alg: 'RS256', use: 'sig' },
    ],
  };
  const newToken = await createToken({
    header: { alg: 'RS256', kid: 'rotated-key' },
    signingKey: otherPrivateKey,
  });
  await assert.doesNotReject(() =>
    authenticator.authorize(
      { headers: { authorization: `Bearer ${newToken}` } },
      { authRequired: true, requiredRoles: [] }
    )
  );

  activeJwks = { keys: [activeJwks.keys[1]] };
  await assert.rejects(
    authenticator.authorize(
      { headers: { authorization: `Bearer ${oldToken}` } },
      { authRequired: true, requiredRoles: [] }
    ),
    { statusCode: 401, errorCode: 'INVALID_TOKEN' }
  );
});
