const roundRobinState = new Map();
const activeConnections = new Map();
const requestCounts = new Map();

function backendKey(routeId, backendId) {
  return `${routeId}:${backendId}`;
}

function eligibleBackends(route, healthMonitor) {
  if (!route.enabled) {
    return [];
  }

  return route.backendInstances
    .filter(
      (backend) =>
        backend.enabled && healthMonitor.getBackendHealth(route, backend).healthy
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function signatureFor(route) {
  return JSON.stringify({
    strategy: route.loadBalancingStrategy,
    backends: route.backendInstances.map(({ id, target, enabled }) => ({
      id,
      target,
      enabled,
    })),
  });
}

function selectBackend(route, healthMonitor) {
  const eligible = eligibleBackends(route, healthMonitor);
  if (eligible.length === 0) {
    return null;
  }

  let backend;
  if (route.loadBalancingStrategy === 'random') {
    backend = eligible[Math.floor(Math.random() * eligible.length)];
  } else if (route.loadBalancingStrategy === 'least_connections') {
    backend = eligible.reduce((least, candidate) => {
      const candidateCount =
        activeConnections.get(backendKey(route._id, candidate.id)) || 0;
      const leastCount = activeConnections.get(backendKey(route._id, least.id)) || 0;
      return candidateCount < leastCount ? candidate : least;
    });
  } else {
    const signature = signatureFor(route);
    const current = roundRobinState.get(route._id);
    const index =
      current && current.signature === signature ? current.index : 0;
    backend = eligible[index % eligible.length];
    roundRobinState.set(route._id, {
      signature,
      index: (index + 1) % eligible.length,
    });
  }

  const key = backendKey(route._id, backend.id);
  requestCounts.set(key, (requestCounts.get(key) || 0) + 1);
  activeConnections.set(key, (activeConnections.get(key) || 0) + 1);
  let released = false;

  return {
    backend,
    activeConnections: activeConnections.get(key),
    release() {
      if (released) {
        return;
      }
      released = true;
      const current = activeConnections.get(key) || 0;
      if (current <= 1) {
        activeConnections.delete(key);
      } else {
        activeConnections.set(key, current - 1);
      }
    },
  };
}

function getActiveConnections(routeId, backendId) {
  return activeConnections.get(backendKey(routeId, backendId)) || 0;
}

function getRequestCount(routeId, backendId) {
  return requestCounts.get(backendKey(routeId, backendId)) || 0;
}

function resetRoute(routeId) {
  roundRobinState.delete(String(routeId));
  const prefix = `${routeId}:`;
  for (const key of requestCounts.keys()) {
    if (key.startsWith(prefix)) requestCounts.delete(key);
  }
}

function syncRoutes(routes) {
  const configured = new Set(
    routes.flatMap((route) =>
      (route.backendInstances || []).map((backend) => backendKey(route._id, backend.id))
    )
  );
  for (const key of requestCounts.keys()) {
    if (!configured.has(key)) requestCounts.delete(key);
  }
}

function reset() {
  roundRobinState.clear();
  activeConnections.clear();
  requestCounts.clear();
}

module.exports = {
  selectBackend,
  getActiveConnections,
  getRequestCount,
  resetRoute,
  syncRoutes,
  reset,
};
