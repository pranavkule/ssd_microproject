const DEFAULT_ERROR_CODES = {
  400: 'BAD_REQUEST',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  500: 'INTERNAL_ERROR',
  503: 'SERVICE_UNAVAILABLE',
};
const { getSafeRequestUrl } = require('../utils/requestLogSanitizer');

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  let statusCode = error.statusCode || error.status || 500;
  let message = error.message || 'Internal server error';
  let errorCode = error.errorCode;

  if (error.type === 'entity.parse.failed') {
    statusCode = 400;
    errorCode = 'INVALID_JSON';
    message = 'Malformed JSON request body';
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = Object.values(error.errors)
      .map((validationError) => validationError.message)
      .join(', ');
  } else if (error.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_VALUE';
    message = `Invalid value for ${error.path}`;
  } else if (error.code === 11000) {
    statusCode = 409;
    errorCode = 'CONFLICT';
    const field = Object.keys(error.keyValue || {})[0] || 'value';
    message = `A route with that ${field} already exists`;
  }

  if (statusCode >= 500) {
    console.error(`[GATEWAY] ${req.method} ${getSafeRequestUrl(req.originalUrl)} failed:`, error);
  }

  if (statusCode === 500 && !error.exposed) {
    message = 'Internal server error';
    errorCode = 'INTERNAL_ERROR';
  }

  res.locals.gatewayErrorCategory = errorCode || `http_${statusCode}`;
  res.status(statusCode).json({
    success: false,
    error: errorCode || DEFAULT_ERROR_CODES[statusCode] || 'REQUEST_FAILED',
    message,
    timestamp: new Date().toISOString(),
  });
}

module.exports = errorHandler;
