const test = require('node:test');
const assert = require('node:assert/strict');
const { GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const {
  createJwtSecretProvider,
  parseJwks,
} = require('../src/services/jwtSecretProvider');

let validJwks;

test.before(async () => {
  const { exportJWK, generateKeyPair } = await import('jose');
  const { publicKey } = await generateKeyPair('RS256', { modulusLength: 2048 });
  const jwk = await exportJWK(publicKey);
  validJwks = {
    keys: [{ ...jwk, kid: 'provider-key', alg: 'RS256', use: 'sig' }],
  };
});

test('validates public-only RSA JWKS and rejects malformed or private material', () => {
  assert.deepEqual(parseJwks(JSON.stringify(validJwks)), validJwks);
  assert.throws(() => parseJwks('not-json'));
  assert.throws(() => parseJwks({ keys: [] }));
  assert.throws(() => parseJwks({
    keys: [{ ...validJwks.keys[0], d: 'private-component' }],
  }));
  assert.throws(() => parseJwks({
    keys: [validJwks.keys[0], validJwks.keys[0]],
  }));
});

test('retrieves and caches the AWS Secrets Manager value without a request per read', async () => {
  const sends = [];
  const provider = createJwtSecretProvider({
    configuration: {
      awsSecretName: 'gateway/jwt/public',
      awsRegion: 'us-west-2',
      jwtRefreshIntervalMs: 300000,
    },
    createAwsClient: (configuration) => {
      assert.equal(configuration.region, 'us-west-2');
      return {
        async send(command) {
          sends.push(command);
          return { SecretString: JSON.stringify(validJwks) };
        },
      };
    },
  });
  assert.equal(await provider.initialize(), true);
  assert.equal(provider.getJwks().keys[0].kid, 'provider-key');
  assert.equal(provider.getStatus().source, 'aws_secrets_manager');
  assert.equal(sends.length, 1);
  assert.ok(sends[0] instanceof GetSecretValueCommand);
  assert.equal(sends[0].input.SecretId, 'gateway/jwt/public');
  assert.equal(provider.getJwks(), provider.getJwks());
  provider.stopRefresh();
});

test('supports binary AWS secrets and controlled successful refresh', async () => {
  let version = validJwks;
  const provider = createJwtSecretProvider({
    configuration: {
      awsSecretName: 'gateway/jwt/public',
      jwtRefreshIntervalMs: 300000,
    },
    createAwsClient: () => ({
      async send() {
        return { SecretBinary: Buffer.from(JSON.stringify(version)) };
      },
    }),
  });
  assert.equal(await provider.initialize(), true);
  version = {
    keys: [{ ...validJwks.keys[0], kid: 'rotated-key' }],
  };
  assert.equal(await provider.refresh(), true);
  assert.equal(provider.getJwks().keys[0].kid, 'rotated-key');
  provider.stopRefresh();
});

test('retains the last good key set when refresh fails or returns invalid data', async () => {
  let fail = false;
  const provider = createJwtSecretProvider({
    configuration: { awsSecretName: 'gateway/jwt/public' },
    createAwsClient: () => ({
      async send() {
        if (fail) throw Object.assign(new Error('private upstream detail'), { name: 'AccessDeniedException' });
        return { SecretString: JSON.stringify(validJwks) };
      },
    }),
  });
  assert.equal(await provider.initialize(), true);
  const cached = provider.getJwks();
  fail = true;
  assert.equal(await provider.refresh(), false);
  assert.equal(provider.getJwks(), cached);
  fail = false;
  const invalidProvider = createJwtSecretProvider({
    configuration: { awsSecretName: 'gateway/jwt/public' },
    createAwsClient: () => ({
      async send() {
        return { SecretString: JSON.stringify({ keys: [] }) };
      },
    }),
  });
  assert.equal(await invalidProvider.initialize(), false);
  assert.equal(invalidProvider.getJwks(), null);
});

test('fails closed for missing, denied, unavailable, and network-failed AWS secret requests', async () => {
  for (const name of [
    'ResourceNotFoundException',
    'AccessDeniedException',
    'ServiceUnavailableException',
    'TimeoutError',
  ]) {
    const provider = createJwtSecretProvider({
      configuration: { awsSecretName: 'gateway/jwt/public' },
      createAwsClient: () => ({
        async send() {
          throw Object.assign(new Error('must not be exposed'), { name });
        },
      }),
    });
    assert.equal(await provider.initialize(), false);
    assert.equal(provider.getJwks(), null);
    assert.equal(provider.getStatus().available, false);
  }
});

test('uses the local public JWKS provider when AWS is not configured', async () => {
  const provider = createJwtSecretProvider({
    configuration: {
      nodeEnv: 'test',
      awsSecretName: '',
      jwtLocalJwksPath: 'local-public-key',
      jwtRefreshIntervalMs: 300000,
    },
    loadLocalSecret: async () => JSON.stringify(validJwks),
  });
  assert.equal(await provider.initialize(), true);
  assert.equal(provider.getStatus().source, 'local_jwks_file');
  assert.equal(provider.getStatus().available, true);
  provider.stopRefresh();
});

test('allows an explicitly enabled local public JWKS provider in production', async () => {
  const provider = createJwtSecretProvider({
    configuration: {
      nodeEnv: 'production',
      jwtAllowLocalJwks: true,
      awsSecretName: '',
      jwtLocalJwksPath: 'local-public-key',
      jwtRefreshIntervalMs: 300000,
    },
    loadLocalSecret: async () => JSON.stringify(validJwks),
  });
  assert.equal(await provider.initialize(), true);
  assert.equal(provider.getStatus().source, 'local_jwks_file');
  provider.stopRefresh();
});

test('does not use the local public JWKS provider in production unless explicitly enabled', async () => {
  const provider = createJwtSecretProvider({
    configuration: {
      nodeEnv: 'production',
      jwtAllowLocalJwks: false,
      awsSecretName: '',
      jwtLocalJwksPath: 'local-public-key',
      jwtRefreshIntervalMs: 300000,
    },
    loadLocalSecret: async () => JSON.stringify(validJwks),
  });
  assert.equal(await provider.initialize(), false);
  assert.equal(provider.getStatus().source, 'unconfigured');
});
