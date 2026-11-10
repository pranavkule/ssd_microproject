const roundRobinState = new Map();
const activeConnections = new Map();

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

function resetRoute(routeId) {
  roundRobinState.delete(String(routeId));
}

function reset() {
  roundRobinState.clear();
  activeConnections.clear();
}

module.exports = {
  selectBackend,
  getActiveConnections,
  resetRoute,
  reset,
};
