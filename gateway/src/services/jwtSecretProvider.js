const fs = require('node:fs/promises');
const env = require('../config/env');

const PRIVATE_JWK_FIELDS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'];

function parseJwks(value) {
  let jwks;
  try {
    jwks = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw new Error('JWT verification secret is not valid JSON');
  }
  if (
    !jwks ||
    typeof jwks !== 'object' ||
    !Array.isArray(jwks.keys) ||
    !jwks.keys.length ||
    jwks.keys.length > 20
  ) {
    throw new Error('JWT verification secret must contain 1-20 keys');
  }
  const kids = new Set();
  for (const key of jwks.keys) {
    if (
      !key ||
      key.kty !== 'RSA' ||
      typeof key.kid !== 'string' ||
      !key.kid ||
      key.kid.length > 128 ||
      !key.n ||
      !key.e ||
      (key.alg && key.alg !== 'RS256') ||
      (key.use && key.use !== 'sig') ||
      (key.key_ops &&
        (!Array.isArray(key.key_ops) ||
          key.key_ops.length !== 1 ||
          key.key_ops[0] !== 'verify')) ||
      PRIVATE_JWK_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(key, field)) ||
      kids.has(key.kid)
    ) {
      throw new Error('JWT verification JWKS contains an unsupported or invalid key');
    }
    kids.add(key.kid);
  }
  return { keys: jwks.keys.map((key) => ({ ...key, alg: 'RS256', use: 'sig' })) };
}

function createJwtSecretProvider(options = {}) {
  const configuration = options.configuration || env;
  const createAwsClient = options.createAwsClient;
  const loadAwsSecret = options.loadAwsSecret || (async () => {
    const {
      GetSecretValueCommand,
      SecretsManagerClient,
    } = require('@aws-sdk/client-secrets-manager');
    if (!awsClient) {
      const clientOptions = {
        region: configuration.awsRegion || undefined,
      };
      awsClient = createAwsClient
        ? createAwsClient(clientOptions)
        : new SecretsManagerClient(clientOptions);
    }
    const result = await awsClient.send(
      new GetSecretValueCommand({ SecretId: configuration.awsSecretName })
    );
    if (result.SecretString !== undefined) return result.SecretString;
    if (result.SecretBinary !== undefined) {
      return Buffer.from(result.SecretBinary).toString('utf8');
    }
    throw new Error('JWT verification secret is empty');
  });
  const loadLocalSecret = options.loadLocalSecret || (async () =>
    fs.readFile(configuration.jwtLocalJwksPath, 'utf8'));
  let awsClient;
  let cachedJwks = null;
  let lastSuccessfulAt = null;
  let refreshTimer = null;
  let refreshInFlight = null;
  const getSource = () => {
    if (configuration.awsSecretName) return 'aws_secrets_manager';
    const localProviderEnabled = configuration.jwtAllowLocalJwks === undefined
      ? ['development', 'test'].includes(configuration.nodeEnv)
      : configuration.jwtAllowLocalJwks;
    if (
      localProviderEnabled &&
      configuration.jwtLocalJwksPath
    ) {
      return 'local_jwks_file';
    }
    return 'unconfigured';
  };

  async function refresh() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const source = getSource();
      if (source === 'unconfigured') {
        throw new Error('No JWT verification key source is configured');
      }
      const raw = source === 'aws_secrets_manager'
        ? await loadAwsSecret()
        : await loadLocalSecret();
      const validated = parseJwks(raw);
      const { importJWK } = await import('jose');
      await Promise.all(validated.keys.map((key) => importJWK(key, 'RS256')));
      cachedJwks = validated;
      lastSuccessfulAt = new Date();
      return true;
    })()
      .catch((error) => {
        console.warn(
          `[AUTH] JWT verification key refresh failed (${getSource()}): ${error.name || 'Error'}`
        );
        return false;
      })
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  }

  return {
    initialize: refresh,
    refresh,
    getJwks() {
      return cachedJwks;
    },
    getStatus() {
      return {
        source: getSource(),
        available: Boolean(cachedJwks),
        lastSuccessfulAt: lastSuccessfulAt ? lastSuccessfulAt.toISOString() : null,
      };
    },
    startRefresh() {
      if (refreshTimer || !Number.isInteger(configuration.jwtRefreshIntervalMs)) return;
      refreshTimer = setInterval(() => void refresh(), configuration.jwtRefreshIntervalMs);
      refreshTimer.unref?.();
    },
    stopRefresh() {
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
    },
  };
}

const jwtSecretProvider = createJwtSecretProvider();

module.exports = {
  PRIVATE_JWK_FIELDS,
  parseJwks,
  createJwtSecretProvider,
  jwtSecretProvider,
};
