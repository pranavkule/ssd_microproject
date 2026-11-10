function createRequestMetrics() {
  const startedAt = new Date();
  const routes = new Map();
  const statusCodes = new Map();
  let totalRequests = 0;
  let successfulRequests = 0;
  let failedRequests = 0;
  let totalDuration = 0;
  let activeRequests = 0;

  function beginRequest() {
    totalRequests += 1;
    activeRequests += 1;
  }

  function completeRequest({ statusCode, durationMs, routeId, routeName }) {
    activeRequests = Math.max(0, activeRequests - 1);
    const success = statusCode < 400;
    successfulRequests += success ? 1 : 0;
    failedRequests += success ? 0 : 1;
    statusCodes.set(statusCode, (statusCodes.get(statusCode) || 0) + 1);
    totalDuration += durationMs;
    const key = routeId || 'unmatched';
    const route = routes.get(key) || {
      routeId: routeId || null,
      routeName: routeName || 'Unmatched',
      requests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      duration: 0,
    };
    route.requests += 1;
    route.successfulRequests += success ? 1 : 0;
    route.failedRequests += success ? 0 : 1;
    route.duration += durationMs;
    routes.set(key, route);
  }

  function getSnapshot() {
    const completed = totalRequests - activeRequests;
    return {
      scope: 'current_process_public_gateway_traffic',
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      totalRequests,
      successfulRequests,
      failedRequests,
      activeRequests,
      averageResponseTimeMs: completed
        ? Number((totalDuration / completed).toFixed(2))
        : 0,
      byStatusCode: Object.fromEntries(
        [...statusCodes.entries()].sort(([a], [b]) => a - b)
      ),
      byRoute: [...routes.values()].map((route) => ({
        routeId: route.routeId,
        routeName: route.routeName,
        requests: route.requests,
        successfulRequests: route.successfulRequests,
        failedRequests: route.failedRequests,
        averageResponseTimeMs: Number((route.duration / route.requests).toFixed(2)),
      })).sort((a, b) => b.requests - a.requests),
    };
  }

  function reset() {
    routes.clear();
    statusCodes.clear();
    totalRequests = 0;
    successfulRequests = 0;
    failedRequests = 0;
    totalDuration = 0;
    activeRequests = 0;
  }

  return { beginRequest, completeRequest, getSnapshot, reset };
}

module.exports = createRequestMetrics();
module.exports.createRequestMetrics = createRequestMetrics;