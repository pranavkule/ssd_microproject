const routeRegistry = require('../services/routeRegistry');
const proxyService = require('../services/proxyService');
const { attachRequestLogging } = require('../middleware/requestLogger');
const backendHealthMonitor = require('../services/backendHealthMonitor');
const loadBalancer = require('../services/loadBalancer');

function sendMethodNotAllowed(req, res, match) {
  req.gatewayMatchedRoute =
    routeRegistry.getRoutes().find((route) => route.path === match.matchedPath) || {
      name: match.routeName,
    };
  res.locals.gatewayErrorCategory = 'method_not_allowed';
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

  req.gatewayRoute = match.route;
  const selection = loadBalancer.selectBackend(
    match.route,
    backendHealthMonitor
  );
  if (!selection) {
    res.locals.gatewayErrorCategory = 'no_healthy_backend';
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

  return proxyService.getDynamicProxy()(req, res, next);
}

module.exports = proxyRoutes;
