const path = require('path');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/dynamic_api_gateway';

const STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

mongoose.connection.on('connected', () => {
  console.log(`[payment-service] Connected to MongoDB database "${mongoose.connection.name}"`);
});

mongoose.connection.on('error', (error) => {
  console.error(`[payment-service] MongoDB error: ${error.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[payment-service] MongoDB connection lost');
});

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
  } catch (error) {
    console.error(`[payment-service] Unable to connect to MongoDB: ${error.message}`);
    console.error('[payment-service] The service remains available without a database connection.');
  }
}

function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;

  return {
    status: STATE_LABELS[readyState] || 'unknown',
    readyState,
    name: mongoose.connection.name || null,
  };
}

module.exports = {
  connectDatabase,
  getDatabaseStatus,
};
