const mongoose = require('mongoose');
const Route = require('../models/Route');
const routeRegistry = require('./routeRegistry');
const backendHealthMonitor = require('./backendHealthMonitor');
const loadBalancer = require('./loadBalancer');
const { connectDatabase } = require('../config/db');
const { buildDefaultRoutes } = require('../config/defaultRoutes');
const {
  createHttpError,
  validateCreatePayload,
  validateUpdatePayload,
  assertValidObjectId,
  normalizeBoolean,
  serializeRoute,
} = require('../utils/routeValidation');

const REFRESH_PATH = '/api/gateway/routes/refresh';

function assertDatabaseAvailable() {
  if (mongoose.connection.readyState !== 1) {
    const error = createHttpError(503, 'Route database is unavailable');
    routeRegistry.recordError(error);
    throw error;
  }
}

async function ensureUniqueRoute(name, path, excludeId) {
  if (name) {
    const query = { name };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existingName = await Route.findOne(query).select('_id').lean();

    if (existingName) {
      throw createHttpError(409, `A route named "${name}" already exists`);
    }
  }

  if (path) {
    const query = { path };

    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existingPath = await Route.findOne(query).select('_id').lean();

    if (existingPath) {
      throw createHttpError(409, `A route with path "${path}" already exists`);
    }
  }
}

async function applyRegistryChange(change, operationDescription) {
  try {
    change();
  } catch (error) {
    routeRegistry.recordError(error);

    try {
      await routeRegistry.loadFromDatabase();
    } catch (reloadError) {
      throw createHttpError(
        500,
        `${operationDescription} was saved in MongoDB but the runtime registry could not be updated. Call POST ${REFRESH_PATH} to recover.`
      );
    }
  }
}

async function initializeDefaultRoutes() {
  assertDatabaseAvailable();
  await Route.init();

  const defaults = buildDefaultRoutes().map(validateCreatePayload);
  let created = 0;
  let skipped = 0;

  for (const route of defaults) {
    const existing = await Route.findOne({
      $or: [{ name: route.name }, { path: route.path }],
    })
      .select(
        '_id name path target methods backendInstances loadBalancingStrategy'
      )
      .lean();

    if (existing) {
      if (existing.name === route.name && existing.path === route.path) {
        const updates = {};
        const methodsToAdd = [];

        if (existing.methods.includes('GET') && !existing.methods.includes('HEAD')) {
          methodsToAdd.push('HEAD');
        }

        if (!existing.backendInstances || existing.backendInstances.length === 0) {
          const firstBackend = {
            id:
              route.name === 'User Service'
                ? 'user-1'
                : `${route.name.toLowerCase().replace(/\s+/g, '-')}-1`,
            target: existing.target || route.target,
            enabled: true,
          };
          const instances = [firstBackend];
          if (
            route.name === 'User Service' &&
            route.backendInstances[1].target !== firstBackend.target
          ) {
            instances.push(route.backendInstances[1]);
          }
          updates.backendInstances = instances;
        }

        if (!existing.loadBalancingStrategy) {
          updates.loadBalancingStrategy = 'round_robin';
        }

        const update = {};
        if (Object.keys(updates).length > 0) {
          update.$set = updates;
        }
        if (methodsToAdd.length > 0) {
          update.$addToSet = { methods: { $each: methodsToAdd } };
        }
        if (Object.keys(update).length > 0) {
          await Route.updateOne({ _id: existing._id }, update);
          console.log(`[ROUTES] Migrated default route configuration: ${route.name}`);
        }
      }

      skipped += 1;
      continue;
    }

    try {
      await Route.create(route);
      created += 1;
      console.log(`[ROUTES] Initialized default route: ${route.name}`);
    } catch (error) {
      if (error.code === 11000) {
        skipped += 1;
        continue;
      }

      throw error;
    }
  }

  console.log(
    `[ROUTES] Default route initialization complete: ${created} created, ${skipped} existing`
  );

  return {
    created,
    skipped,
    total: defaults.length,
  };
}

async function initializeRouteSystem() {
  try {
    const defaults = await initializeDefaultRoutes();
    const stats = await routeRegistry.loadFromDatabase();
    backendHealthMonitor.syncRoutes(routeRegistry.getRoutes());

    return {
      ...stats,
      defaultsCreated: defaults.created,
      defaultsSkipped: defaults.skipped,
    };
  } catch (error) {
    routeRegistry.markInitializationFailure(error);
    throw error;
  }
}

async function listRoutes() {
  assertDatabaseAvailable();

  const routes = await Route.find().sort({ path: 1, name: 1 }).lean();

  return {
    routes: routes.map(serializeRouteWithHealth),
    registry: routeRegistry.getStats(),
  };
}

async function getRouteById(id) {
  assertValidObjectId(id);
  assertDatabaseAvailable();

  const route = await Route.findById(id);

  if (!route) {
    throw createHttpError(404, 'Route not found');
  }

  return serializeRouteWithHealth(route);
}

function serializeRouteWithHealth(route) {
  const serialized = serializeRoute(route);
  return {
    ...serialized,
    backendInstances: serialized.backendInstances.map((backend) => {
      const target = new URL(backend.target);
      return {
        ...backend,
        name: backend.id,
        port: Number(target.port) || (target.protocol === 'https:' ? 443 : 80),
        requestCount: loadBalancer.getRequestCount(serialized._id, backend.id),
        health: backendHealthMonitor.getBackendHealth(serialized, backend),
      };
    }),
  };
}

async function createRoute(payload) {
  const routeData = validateCreatePayload(payload);
  assertDatabaseAvailable();
  await ensureUniqueRoute(routeData.name, routeData.path);

  let route;

  try {
    route = await Route.create(routeData);
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || 'route';
      throw createHttpError(409, `A route with that ${field} already exists`);
    }

    throw error;
  }

  const serializedRoute = serializeRoute(route);
  await applyRegistryChange(
    () => routeRegistry.upsertRoute(serializedRoute),
    'Route creation'
  );

  console.log(`[ROUTES] Created route: ${route.name}`);
  return serializeRouteWithHealth(serializedRoute);
}

async function updateRoute(id, payload) {
  assertValidObjectId(id);
  const updates = validateUpdatePayload(payload);
  assertDatabaseAvailable();

  const route = await Route.findById(id);

  if (!route) {
    throw createHttpError(404, 'Route not found');
  }

  await ensureUniqueRoute(updates.name, updates.path, id);
  if (updates.target && !updates.backendInstances) {
    const instances =
      route.backendInstances && route.backendInstances.length > 0
        ? route.backendInstances.map((backend) => backend.toObject())
        : [{ id: 'primary', target: route.target, enabled: true }];
    instances[0].target = updates.target;
    updates.backendInstances = instances;
  }
  Object.assign(route, updates);

  try {
    await route.save();
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || 'route';
      throw createHttpError(409, `A route with that ${field} already exists`);
    }

    throw error;
  }

  const serializedRoute = serializeRoute(route);
  await applyRegistryChange(
    () => routeRegistry.upsertRoute(serializedRoute),
    'Route update'
  );

  console.log(`[ROUTES] Updated route: ${route.name}`);
  return serializeRouteWithHealth(serializedRoute);
}

async function toggleRoute(id, body) {
  assertValidObjectId(id);
  assertDatabaseAvailable();

  if (body !== undefined && body !== null) {
    if (typeof body !== 'object' || Array.isArray(body)) {
      throw createHttpError(400, 'Request body must be a JSON object');
    }
  }

  const route = await Route.findById(id);

  if (!route) {
    throw createHttpError(404, 'Route not found');
  }

  let nextEnabled = !route.enabled;

  if (body && Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    nextEnabled = normalizeBoolean(body.enabled, 'enabled');
  }

  if (nextEnabled === route.enabled) {
    return {
      route: serializeRouteWithHealth(route),
      changed: false,
    };
  }

  route.enabled = nextEnabled;
  await route.save();

  const serializedRoute = serializeRoute(route);
  await applyRegistryChange(
    () => routeRegistry.upsertRoute(serializedRoute),
    'Route status update'
  );

  console.log(
    `[ROUTES] ${nextEnabled ? 'Enabled' : 'Disabled'} route: ${route.name}`
  );

  return {
    route: serializeRouteWithHealth(serializedRoute),
    changed: true,
  };
}

async function deleteRoute(id) {
  assertValidObjectId(id);
  assertDatabaseAvailable();

  const route = await Route.findByIdAndDelete(id);

  if (!route) {
    throw createHttpError(404, 'Route not found');
  }

  await applyRegistryChange(
    () => routeRegistry.removeRoute(id),
    'Route deletion'
  );

  console.log(`[ROUTES] Deleted route: ${route.name}`);
  return serializeRouteWithHealth(route);
}

async function refreshRegistry() {
  if (mongoose.connection.readyState === 0) {
    await connectDatabase();
  }

  assertDatabaseAvailable();

  try {
    const currentStats = routeRegistry.getStats();
    let defaults = {
      created: 0,
      skipped: 0,
    };

    if (currentStats.status !== 'loaded') {
      defaults = await initializeDefaultRoutes();
    }

    const stats = await routeRegistry.loadFromDatabase();
    backendHealthMonitor.syncRoutes(routeRegistry.getRoutes());
    console.log('[ROUTES] Registry refreshed successfully');

    return {
      ...stats,
      defaultsCreated: defaults.created,
      defaultsSkipped: defaults.skipped,
    };
  } catch (error) {
    routeRegistry.recordError(error);
    throw error;
  }
}

module.exports = {
  initializeRouteSystem,
  listRoutes,
  getRouteById,
  createRoute,
  updateRoute,
  toggleRoute,
  deleteRoute,
  refreshRegistry,
};
