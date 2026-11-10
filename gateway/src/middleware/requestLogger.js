const { redactTarget } = require('../utils/routeValidation');
const { getSafeRequestUrl } = require('../utils/requestLogSanitizer');

function attachRequestLogging(req, res, route, backend) {
  res.locals.gatewayRoute = route;
  res.locals.proxyStartedAt = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - res.locals.proxyStartedAt;

    console.log(
      `[GATEWAY] ${new Date().toISOString()} ${req.method} ${getSafeRequestUrl(req.originalUrl)} -> ${route.name} | ${backend.id} (${redactTarget(backend.target)}) | ${route.loadBalancingStrategy} | ${res.statusCode} | ${duration}ms`
    );
  });
}

module.exports = {
  attachRequestLogging,
};
