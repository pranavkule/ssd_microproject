const mongoose = require('mongoose');
const { connectDatabase } = require('./config/db');
const app = require('./app');

const PORT = Number(process.env.PORT) || 5005;

const server = app.listen(PORT, () => {
  console.log(`[order-service] Running on http://localhost:${PORT}`);
  console.log(`[order-service] Health endpoint: http://localhost:${PORT}/health`);
  connectDatabase();
});

function shutdown(signal) {
  console.log(`[order-service] Received ${signal}. Shutting down...`);

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
  console.error('[order-service] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[order-service] Uncaught exception:', error);
});
