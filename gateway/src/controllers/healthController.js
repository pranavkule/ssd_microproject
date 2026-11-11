const env = require('../config/env');
const { getDatabaseStatus } = require('../config/db');
const routeRegistry = require('../services/routeRegistry');
const backendHealthMonitor = require('../services/backendHealthMonitor');
const { redactTarget } = require('../utils/routeValidation');
const loadBalancer = require('../services/loadBalancer');

function getBackendPort(target) {
  const url = new URL(target);
  return Number(url.port) || (url.protocol === 'https:' ? 443 : 80);
}

function getHealth(req, res) {
  const routes = routeRegistry.getRoutes();
  const registry = routeRegistry.getStats();

  res.status(200).json({
    application: 'Dynamic L7 API Gateway',
    status: 'running',
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: getDatabaseStatus(),
    routeRegistry: registry,
    loadBalancing: {
      totalBackends: registry.totalBackends,
      healthyBackends: registry.healthyBackends,
      unhealthyBackends: registry.unhealthyBackends,
      disabledBackends: registry.disabledBackends,
    },
    routes: routes.map((route) => ({
      name: route.name,
      id: route._id,
      pathPrefix: route.path,
      enabled: route.enabled,
      loadBalancingStrategy: route.loadBalancingStrategy,
      backends: route.backendInstances.map((backend) => ({
        id: backend.id,
        name: backend.id,
        port: getBackendPort(backend.target),
        requestCount: loadBalancer.getRequestCount(route._id, backend.id),
        target: redactTarget(backend.target),
        enabled: route.enabled && backend.enabled,
        weight: backend.weight || null,
        health: backendHealthMonitor.getBackendHealth(route, backend),
      })),
    })),
    services: routes.map((route) => ({
      name: route.name,
      url: redactTarget(route.target),
      pathPrefix: route.path,
      routingEnabled: route.enabled,
    })),
  });
}

module.exports = {
  getHealth,
};
