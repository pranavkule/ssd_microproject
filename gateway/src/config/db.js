const mongoose = require('mongoose');
const env = require('./env');

const STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
};

mongoose.connection.on('connected', () => {
  console.log(`[database] Connected to MongoDB database "${mongoose.connection.name}"`);
});

mongoose.connection.on('error', (error) => {
  console.error(`[database] MongoDB error: ${error.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[database] MongoDB connection lost');
});

async function connectDatabase() {
  if (mongoose.connection.readyState === 1) {
    return true;
  }

  try {
    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    return true;
  } catch (error) {
    console.error(`[database] Unable to connect to MongoDB: ${error.message}`);
    console.error(
      '[database] The gateway remains available. Start MongoDB or set a valid MONGODB_URI.'
    );
    return false;
  }
}

function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;
  const databaseName = mongoose.connection.name || null;

  return {
    status: STATE_LABELS[readyState] || 'unknown',
    readyState,
    name: databaseName,
  };
}

module.exports = {
  connectDatabase,
  getDatabaseStatus,
};
