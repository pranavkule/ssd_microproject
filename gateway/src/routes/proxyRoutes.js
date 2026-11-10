const routeRegistry = require('../services/routeRegistry');
const { createDynamicProxy } = require('../services/proxyService');
const { attachRequestLogging } = require('../middleware/requestLogger');
const backendHealthMonitor = require('../services/backendHealthMonitor');
const loadBalancer = require('../services/loadBalancer');

const proxy = createDynamicProxy();

function sendMethodNotAllowed(req, res, match) {
  const allowHeader = match.allowedMethods.join(', ');

  res.set('Allow', allowHeader);
  res.status(405).json({
    success: false,
    error: 'METHOD_NOT_ALLOWED',
    message: `Method ${req.method} is not allowed for route "${match.routeName}"`,
    route: match.routeName,
    path: match.matchedPath,
    allowedMethods: match.allowedMethods,
    timestamp: new Date().toISOString(),
  });
}

function proxyRoutes(req, res, next) {
  const match = routeRegistry.matchRoute(req.path, req.method);

  if (match.methodNotAllowed) {
    return sendMethodNotAllowed(req, res, match);
  }

  if (!match.route) {
    return next();
  }

  const selection = loadBalancer.selectBackend(
    match.route,
    backendHealthMonitor
  );
  if (!selection) {
    console.warn(
      `[GATEWAY] No healthy backend available for route ${match.route.name}`
    );
    return res.status(503).json({
      success: false,
      error: 'NO_HEALTHY_BACKENDS',
      message: `No healthy backend is available for route "${match.route.name}"`,
      route: match.route.name,
      timestamp: new Date().toISOString(),
    });
  }

  const backend = selection.backend;
  req.gatewayBackend = backend;
  req.gatewayRoute = { ...match.route, target: backend.target };
  req.gatewayRoute.backendInstances = match.route.backendInstances.map((item) =>
    item.id === backend.id ? backend : item
  );
  const release = () => selection.release();
  res.once('finish', release);
  res.once('close', release);
  attachRequestLogging(req, res, req.gatewayRoute, backend);

  return proxy(req, res, next);
}

module.exports = proxyRoutes;
