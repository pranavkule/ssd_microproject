const mongoose = require('mongoose');
const { connectDatabase } = require('./config/db');
const app = require('./app');

const PORT = Number(process.env.PORT) || 5007;
const HOST = process.env.SERVICE_HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  console.log(`[payment-service] Running on http://${HOST}:${PORT}`);
  console.log(`[payment-service] Health endpoint: http://${HOST}:${PORT}/health`);
  connectDatabase();
});

function shutdown(signal) {
  console.log(`[payment-service] Received ${signal}. Shutting down...`);

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
  console.error('[payment-service] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[payment-service] Uncaught exception:', error);
});
