const env = require('../config/env');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const statusCode = error.statusCode || error.status || 500;
  const message = statusCode === 500 ? 'Internal server error' : error.message;

  if (statusCode >= 500) {
    console.error(`[gateway] ${req.method} ${req.originalUrl} failed:`, error);
  }

  const payload = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };

  if (env.nodeEnv === 'development') {
    payload.stack = error.stack;
  }

  res.status(statusCode).json(payload);
}

module.exports = errorHandler;
