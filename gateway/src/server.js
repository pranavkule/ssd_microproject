const mongoose = require('mongoose');
const app = require('./app');
const env = require('./config/env');
const { connectDatabase } = require('./config/db');
const routeRegistry = require('./services/routeRegistry');
const routeService = require('./services/routeService');
const backendHealthMonitor = require('./services/backendHealthMonitor');
const gatewayConfiguration = require('./services/gatewayConfiguration');
const GatewayRequestLog = require('./models/GatewayRequestLog');
const { jwtSecretProvider } = require('./services/jwtSecretProvider');
const { jwtAuthenticator } = require('./services/jwtAuthentication');

let server;

async function startGateway() {
  await jwtAuthenticator.initialize();
  await jwtSecretProvider.initialize();
  jwtSecretProvider.startRefresh();

  const connected = await connectDatabase();

  if (!connected) {
    routeRegistry.markInitializationFailure(
      new Error('MongoDB was unavailable during gateway startup')
    );
  } else {
    try {
      await GatewayRequestLog.init();
    } catch (error) {
      console.error(`[LOGS] Unable to initialize request log indexes: ${error.message}`);
    }
    await gatewayConfiguration.initialize();
    try {
      await routeService.initializeRouteSystem();
    } catch (error) {
      console.error(
        '[ROUTES] Gateway started without a loaded route registry. Use POST /api/gateway/routes/refresh after MongoDB is available.'
      );
    }
  }

  await backendHealthMonitor.start(routeRegistry.getRoutes());

  server = app.listen(env.port, env.host, () => {
    console.log(
      `[gateway] Dynamic L7 API Gateway running on http://${env.host}:${env.port}`
    );
    console.log(
      `[gateway] Health endpoint: http://${env.host}:${env.port}/health`
    );
  });
}

function shutdown(signal) {
  console.log(`[gateway] Received ${signal}. Shutting down...`);
  backendHealthMonitor.stop();
  jwtSecretProvider.stopRefresh();

  if (!server) {
    process.exit(0);
    return;
  }

  server.close(async () => {
    try {
      await mongoose.connection.close();
    } finally {
      process.exit(0);
    }
  });

  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  console.error('[gateway] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[gateway] Uncaught exception:', error);
});

startGateway().catch((error) => {
  console.error('[gateway] Failed to start gateway:', error);

  if (!server) {
    server = app.listen(env.port, env.host);
  }
});
