const { findProxiedServiceByPath } = require('../config/services');

function requestLogger(req, res, next) {
  const service = findProxiedServiceByPath(req.path);

  if (!service) {
    return next();
  }

  res.locals.proxyService = service;
  res.locals.proxyStartedAt = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - res.locals.proxyStartedAt;

    console.log(
      `[GATEWAY] ${new Date().toISOString()} ${req.method} ${req.originalUrl} -> ${service.name} | ${res.statusCode} | ${duration}ms`
    );
  });

  next();
}

module.exports = requestLogger;
