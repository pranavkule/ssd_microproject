const mongoose = require('mongoose');
const app = require('./app');
const env = require('./config/env');
const { connectDatabase } = require('./config/db');

const server = app.listen(env.port, () => {
  console.log(`[gateway] Dynamic L7 API Gateway running on http://localhost:${env.port}`);
  console.log(`[gateway] Health endpoint: http://localhost:${env.port}/health`);
  connectDatabase();
});

function shutdown(signal) {
  console.log(`[gateway] Received ${signal}. Shutting down...`);

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
