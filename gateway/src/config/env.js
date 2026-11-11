const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

const env = {
  port: Number(process.env.PORT) || 8000,
  host: process.env.GATEWAY_HOST || '127.0.0.1',
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dynamic_api_gateway',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  userServiceUrl: process.env.USER_SERVICE_URL || 'http://localhost:5001',
  userServiceUrl2: process.env.USER_SERVICE_URL_2 || 'http://localhost:5002',
  productServiceUrl: process.env.PRODUCT_SERVICE_URL || 'http://localhost:5003',
  orderServiceUrl: process.env.ORDER_SERVICE_URL || 'http://localhost:5005',
  paymentServiceUrl: process.env.PAYMENT_SERVICE_URL || 'http://localhost:5007',
  proxyTimeoutMs: positiveInteger(process.env.GATEWAY_PROXY_TIMEOUT_MS, 10000),
  healthCheckPath: process.env.BACKEND_HEALTH_CHECK_PATH || '/health',
  healthCheckIntervalMs: positiveInteger(
    process.env.BACKEND_HEALTH_CHECK_INTERVAL_MS,
    5000
  ),
  healthCheckTimeoutMs: positiveInteger(
    process.env.BACKEND_HEALTH_CHECK_TIMEOUT_MS,
    1500
  ),
  healthCheckFailureThreshold: positiveInteger(
    process.env.BACKEND_HEALTH_CHECK_FAILURE_THRESHOLD,
    2
  ),
  healthCheckRecoveryThreshold: positiveInteger(
    process.env.BACKEND_HEALTH_CHECK_RECOVERY_THRESHOLD,
    1
  ),
  awsRegion: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '',
  awsSecretName: process.env.AWS_SECRET_NAME || process.env.AWS_SECRET_ARN || '',
  jwtIssuer: process.env.JWT_ISSUER || 'dynamic-api-gateway',
  jwtAudience: process.env.JWT_AUDIENCE || 'dynamic-api-gateway',
  jwtAlgorithm: process.env.JWT_ALGORITHM || 'RS256',
  jwtAllowLocalJwks:
    process.env.JWT_ALLOW_LOCAL_JWKS === 'true' ||
    (process.env.NODE_ENV || 'development') === 'development' ||
    (process.env.NODE_ENV || 'development') === 'test',
  jwtLocalJwksPath:
    process.env.JWT_LOCAL_JWKS_PATH ||
    path.resolve(__dirname, '../../.local-jwt/public.jwks.json'),
  jwtDemoPrivateKeyPath:
    process.env.JWT_DEMO_PRIVATE_KEY_PATH ||
    path.resolve(__dirname, '../../.local-jwt/private.pem'),
  jwtRefreshIntervalMs: boundedInteger(
    process.env.JWT_SECRET_REFRESH_INTERVAL_MS,
    300000,
    1000,
    86400000
  ),
};

module.exports = env;
