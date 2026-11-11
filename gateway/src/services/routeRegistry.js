const Route = require('../models/Route');
const backendHealthMonitor = require('./backendHealthMonitor');
const loadBalancer = require('./loadBalancer');
const {
  pathMatchesPrefix,
  normalizeRegistryRoute,
} = require('../utils/routeValidation');

let allRoutes = Object.freeze([]);
let activeRoutes = Object.freeze([]);
let registryState = {
  status: 'not_loaded',
  lastLoadedAt: null,
  lastError: null,
  stale: false,
};

function sortRoutes(routes) {
  return [...routes].sort((left, right) => {
    if (right.path.length !== left.path.length) {
      return right.path.length - left.path.length;
    }

    const pathComparison = left.path.localeCompare(right.path);
    if (pathComparison !== 0) {
      return pathComparison;
    }

    return left.name.localeCompare(right.name);
  });
}

function freezeRoute(route) {
  return Object.freeze({
    ...route,
    methods: Object.freeze([...route.methods]),
    requiredRoles: Object.freeze([...route.requiredRoles]),
    backendInstances: Object.freeze(
      route.backendInstances.map((backend) => Object.freeze({ ...backend }))
    ),
  });
}

function applySnapshot(routes, metadata) {
  const normalizedRoutes = routes.map(normalizeRegistryRoute);
  const ids = new Set();
  const paths = new Set();

  for (const route of normalizedRoutes) {
    if (ids.has(route._id)) {
      throw new Error(`Duplicate route id in registry snapshot: ${route._id}`);
    }

    if (paths.has(route.path)) {
      throw new Error(`Duplicate route path in registry snapshot: ${route.path}`);
    }

    ids.add(route._id);
    paths.add(route.path);
  }

  const sortedRoutes = sortRoutes(normalizedRoutes);
  const nextActiveRoutes = sortedRoutes.filter((route) => route.enabled);
  const frozenAllRoutes = Object.freeze(sortedRoutes.map(freezeRoute));
  const frozenActiveRoutes = Object.freeze(nextActiveRoutes.map(freezeRoute));

  allRoutes = frozenAllRoutes;
  activeRoutes = frozenActiveRoutes;
  registryState = {
    status: metadata.status,
    lastLoadedAt: metadata.lastLoadedAt,
    lastError: metadata.lastError,
    stale: metadata.stale,
  };
  backendHealthMonitor.syncRoutes(allRoutes);
  loadBalancer.syncRoutes(allRoutes);

  return getStats();
}

function getStats() {
  let totalBackends = 0;
  let healthyBackends = 0;
  let unhealthyBackends = 0;
  let disabledBackends = 0;

  for (const route of allRoutes) {
    for (const backend of route.backendInstances) {
      totalBackends += 1;
      if (!route.enabled || !backend.enabled) {
        disabledBackends += 1;
      } else if (
        backendHealthMonitor.getBackendHealth(route, backend).healthy
      ) {
        healthyBackends += 1;
      } else {
        unhealthyBackends += 1;
      }
    }
  }

  return {
    status: registryState.status,
    totalRoutes: allRoutes.length,
    enabledRoutes: activeRoutes.length,
    disabledRoutes: allRoutes.length - activeRoutes.length,
    totalBackends,
    healthyBackends,
    unhealthyBackends,
    disabledBackends,
    lastLoadedAt: registryState.lastLoadedAt
      ? registryState.lastLoadedAt.toISOString()
      : null,
    lastError: registryState.lastError,
    stale: registryState.stale,
  };
}

function getRoutes() {
  return allRoutes;
}

async function loadFromDatabase() {
  try {
    const documents = await Route.find().lean();
    const stats = applySnapshot(documents, {
      status: 'loaded',
      lastLoadedAt: new Date(),
      lastError: null,
      stale: false,
    });

    console.log(
      `[ROUTES] Registry loaded: ${stats.totalRoutes} routes (${stats.enabledRoutes} enabled)`
    );

    return stats;
  } catch (error) {
    registryState = {
      ...registryState,
      status: registryState.status === 'loaded' ? 'loaded' : 'error',
      lastError: error.message,
      stale: registryState.status === 'loaded',
    };

    console.error(`[ROUTES] Registry load failed: ${error.message}`);
    throw error;
  }
}

function markInitializationFailure(error) {
  allRoutes = Object.freeze([]);
  activeRoutes = Object.freeze([]);
  backendHealthMonitor.syncRoutes([]);
  registryState = {
    status: 'error',
    lastLoadedAt: null,
    lastError: error.message,
    stale: false,
  };

  console.error(`[ROUTES] Registry initialization failed: ${error.message}`);
}

function recordError(error) {
  registryState = {
    ...registryState,
    status: registryState.status === 'not_loaded' ? 'error' : registryState.status,
    lastError: error.message,
    stale: registryState.status === 'loaded' ? true : registryState.stale,
  };
}

function upsertRoute(route) {
  const normalizedRoute = normalizeRegistryRoute(route);
  const routeExists = allRoutes.some((item) => item._id === normalizedRoute._id);
  const nextRoutes = routeExists
    ? allRoutes.map((item) =>
        item._id === normalizedRoute._id ? normalizedRoute : item
      )
    : [...allRoutes, normalizedRoute];

  return applySnapshot(nextRoutes, {
    status: registryState.status,
    lastLoadedAt: registryState.lastLoadedAt,
    lastError: null,
    stale: false,
  });
}

function removeRoute(routeId) {
  const nextRoutes = allRoutes.filter((route) => route._id !== String(routeId));

  if (nextRoutes.length === allRoutes.length) {
    return getStats();
  }

  return applySnapshot(nextRoutes, {
    status: registryState.status,
    lastLoadedAt: registryState.lastLoadedAt,
    lastError: null,
    stale: false,
  });
}

function matchRoute(pathname, method) {
  const route = activeRoutes.find((item) => pathMatchesPrefix(pathname, item.path));

  if (!route) {
    return {
      route: null,
      pathMatched: false,
      methodNotAllowed: false,
      allowedMethods: [],
    };
  }

  const requestMethod = String(method || '').toUpperCase();
  const allowedMethods = [...route.methods];
  if (allowedMethods.includes('GET') && !allowedMethods.includes('HEAD')) {
    allowedMethods.push('HEAD');
  }

  const methodAllowed =
    allowedMethods.includes(requestMethod) ||
    (requestMethod === 'HEAD' && allowedMethods.includes('GET'));

  if (!methodAllowed) {
    return {
      route: null,
      pathMatched: true,
      methodNotAllowed: true,
      matchedPath: route.path,
      routeName: route.name,
      allowedMethods,
    };
  }

  return {
    route,
    pathMatched: true,
    methodNotAllowed: false,
    allowedMethods,
  };
}

function getTargetPathname(target) {
  try {
    return new URL(target).pathname || '/';
  } catch (error) {
    return '/';
  }
}

function rewritePath(route, originalUrl) {
  if (!route || !route.stripPrefix) {
    return originalUrl;
  }

  const queryIndex = originalUrl.indexOf('?');
  const pathname =
    queryIndex === -1 ? originalUrl : originalUrl.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : originalUrl.slice(queryIndex);

  if (pathname === route.path) {
    const targetPathname = getTargetPathname(route.target);

    if (targetPathname === '/' || targetPathname === '') {
      return `/${query}`;
    }

    return query;
  }

  let remainder = pathname.slice(route.path.length);

  if (!remainder.startsWith('/')) {
    remainder = `/${remainder}`;
  }

  return `${remainder}${query}`;
}

module.exports = {
  loadFromDatabase,
  markInitializationFailure,
  recordError,
  upsertRoute,
  removeRoute,
  matchRoute,
  rewritePath,
  getStats,
  getRoutes,
};
