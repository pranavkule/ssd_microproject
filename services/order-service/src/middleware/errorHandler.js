function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal server error';

  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(error.errors)
      .map((validationError) => validationError.message)
      .join(', ');
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${error.path}`;
  } else if (error.code === 11000) {
    statusCode = 409;
    const field = Object.keys(error.keyValue || {})[0] || 'value';
    message = `A record with that ${field} already exists`;
  }

  if (statusCode >= 500) {
    console.error(`[order-service] ${req.method} ${req.originalUrl} failed:`, error);
    message = 'Internal server error';
  }

  res.status(statusCode).json({
    success: false,
    message,
    timestamp: new Date().toISOString(),
  });
}

module.exports = errorHandler;
