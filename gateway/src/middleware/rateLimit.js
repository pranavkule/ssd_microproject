const { rateLimiter } = require('../services/rateLimiter');

function getClientId(req) {
  return req.socket?.remoteAddress || 'unknown';
}

function rateLimit(req, res) {
  const result = rateLimiter.consume(getClientId(req));
  if (!result.allowed) {
    res.locals.gatewayErrorCategory = 'rate_limited';
    res.set('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
      timestamp: new Date().toISOString(),
    });
    return false;
  }
  return true;
}

module.exports = { rateLimit, getClientId };
