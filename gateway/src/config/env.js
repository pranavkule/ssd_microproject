const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const env = {
  port: Number(process.env.PORT) || 8000,
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
};

module.exports = env;
